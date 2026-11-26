"use server";

import { redirect } from "next/navigation";
import { normalizeCep } from "@/lib/auth/cep";
import { startBilling } from "@/lib/auth/billing";
import { CONSENT_KEYS } from "@/lib/auth/consents";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import {
  OUT_OF_AREA_MESSAGE,
  readSignupForm,
  signupErrorMessage,
  validateSignup,
  type SignupErrors,
  type SignupFields,
} from "@/lib/auth/signup-validation";

export type SignupState = {
  errors: SignupErrors;
  formError?: string;
  values?: SignupFields & Record<string, string>;
  nonce: number;
};

export async function checkCep(cep: string): Promise<{ ok: boolean; message: string }> {
  const normalized = normalizeCep(cep);
  if (!normalized) return { ok: false, message: "Informe um CEP com 8 dígitos." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_service_area", { p_cep: normalized });
  if (error) return { ok: false, message: "Não foi possível verificar o CEP agora." };
  const area = data?.[0];
  return area
    ? { ok: true, message: `Entregamos em ${area.area_name}.` }
    : { ok: false, message: OUT_OF_AREA_MESSAGE };
}

export async function submitSignup(prev: SignupState, formData: FormData): Promise<SignupState> {
  const nonce = prev.nonce + 1;
  const user = await getAuthUser();
  if (!user) redirect("/assinar");

  const { fields, consents } = readSignupForm(formData);
  const values = { ...fields } as SignupFields & Record<string, string>;
  for (const k of CONSENT_KEYS) values[`consent_${k}`] = consents[k] ? "on" : "";

  const errors = validateSignup(fields, consents);
  if (Object.keys(errors).length > 0) return { errors, values, nonce };

  const supabase = await createSupabaseServerClient();
  let rpc;
  try {
    rpc = await supabase.rpc("signup_customer", {
      p_full_name: fields.full_name,
      p_whatsapp: fields.whatsapp,
      p_cep: fields.cep,
      p_street: fields.street,
      p_number: fields.number,
      p_complement: fields.complement,
      p_reference: fields.reference,
      p_consents: consents,
      p_consent_version: String(formData.get("consent_version") ?? ""),
    });
  } catch {
    return { errors: {}, formError: "Não foi possível concluir o cadastro agora. Confira sua conexão e tente de novo.", values, nonce };
  }
  const { data, error } = rpc;


  if (error || !data) {
    const m = signupErrorMessage(error?.message);
    if (m.code === "already_customer") redirect("/conta");
    return m.field
      ? { errors: { [m.field]: m.message }, values, nonce }
      : { errors: {}, formError: m.message, values, nonce };
  }

  const { redirectTo } = await startBilling(data.subscription_id);
  redirect(redirectTo);
}
