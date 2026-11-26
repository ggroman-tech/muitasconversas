import { CONSENT_KEYS, CONSENT_PURPOSES } from "./consents";
import { normalizeCep } from "./cep";

export type SignupFields = {
  full_name: string;
  whatsapp: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
};

export type SignupErrors = Partial<Record<keyof SignupFields | "consents", string>>;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export function readSignupForm(fd: FormData): {
  fields: SignupFields;
  consents: Record<string, boolean>;
} {
  const fields: SignupFields = {
    full_name: str(fd.get("full_name")),
    whatsapp: str(fd.get("whatsapp")),
    cep: str(fd.get("cep")),
    street: str(fd.get("street")),
    number: str(fd.get("number")),
    complement: str(fd.get("complement")),
    reference: str(fd.get("reference")),
  };
  const consents: Record<string, boolean> = {};
  for (const key of CONSENT_KEYS) consents[key] = fd.get(`consent_${key}`) === "on";
  return { fields, consents };
}

/** Validação de formato (a regra de área e consentimento definitiva roda no SQL). */
export function validateSignup(
  fields: SignupFields,
  consents: Record<string, boolean>,
): SignupErrors {
  const e: SignupErrors = {};
  if (fields.full_name.length < 3) e.full_name = "Informe seu nome completo.";
  if (fields.whatsapp) {
    const d = fields.whatsapp.replace(/\D/g, "");
    if (d.length < 10 || d.length > 13) e.whatsapp = "Informe o WhatsApp com DDD, ou deixe em branco.";
  }
  if (!normalizeCep(fields.cep)) e.cep = "Informe um CEP com 8 dígitos.";
  if (fields.street.length < 2) e.street = "Informe a rua.";
  if (fields.number.length < 1) e.number = "Informe o número (ou s/n).";
  for (const key of CONSENT_KEYS) {
    if (CONSENT_PURPOSES[key].required && !consents[key]) {
      e.consents = "Para continuar, aceite os dois itens obrigatórios.";
    }
  }
  return e;
}

/** Validação de um campo só (mensagem inline ao sair do campo). Devolve null se estiver ok. */
export function validateField(name: keyof SignupFields, value: string): string | null {
  const probe: SignupFields = { full_name: "ok ok", whatsapp: "", cep: "22281080", street: "ok", number: "1", complement: "", reference: "" };
  const errors = validateSignup({ ...probe, [name]: value.trim() }, { privacy_policy: true, service_rules: true });
  return errors[name] ?? null;
}

export const OUT_OF_AREA_MESSAGE =
  "Ainda não entregamos neste CEP. Atendemos somente a Zona Sul do Rio, nas áreas já liberadas. Confira o CEP ou tente outro endereço de entrega.";

/** Traduz os códigos de erro de signup_customer (message = 'signup:<codigo>'). */
export function signupErrorMessage(rpcMessage: string | undefined): {
  field?: keyof SignupErrors;
  message: string;
  code: string;
} {
  const code = (rpcMessage ?? "").replace(/^.*signup:/, "").trim();
  switch (code) {
    case "out_of_area":
      return { code, field: "cep", message: OUT_OF_AREA_MESSAGE };
    case "invalid_cep":
      return { code, field: "cep", message: "Informe um CEP com 8 dígitos." };
    case "invalid_name":
      return { code, field: "full_name", message: "Informe seu nome completo." };
    case "invalid_whatsapp":
      return { code, field: "whatsapp", message: "Informe o WhatsApp com DDD, ou deixe em branco." };
    case "invalid_address":
      return { code, field: "street", message: "Confira rua e número do endereço." };
    case "consent_required":
      return { code, field: "consents", message: "Para continuar, aceite os dois itens obrigatórios." };
    case "consent_version":
      return { code, message: "Os termos foram atualizados. Recarregue a página e aceite novamente." };
    case "not_authenticated":
      return { code, message: "Sua sessão expirou. Confirme seu e-mail novamente." };
    case "already_customer":
      return { code, message: "Você já tem cadastro. Acesse sua conta." };
    default:
      return { code: "unknown", message: "Não foi possível concluir o cadastro agora. Tente novamente em instantes." };
  }
}
