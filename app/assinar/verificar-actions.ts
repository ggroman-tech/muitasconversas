"use server";

import { revalidatePath } from "next/cache";
import { claimPreapproval, MP_ID_RE } from "@/lib/assinatura/server";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";

export type VerifyState = {
  status: "idle" | "active" | "pending" | "error";
  message?: string;
  /** Muda a cada tentativa, para o cliente reagir mesmo com a mesma resposta. */
  nonce: number;
};

/**
 * "Já paguei, verificar agora": força a sincronização com o Mercado Pago
 * (Edge Function mercadopago-claim, CONTRATO-FRONT-BACK.md), reivindica o
 * preapproval_id de retorno (se houver) e relê a situação da assinatura.
 */
export async function verifyPayment(prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const nonce = prev.nonce + 1;
  const user = await getAuthUser();
  if (!user) return { status: "error", message: "Sua sessão expirou. Entre novamente.", nonce };

  const supabase = await createSupabaseServerClient();

  const pid = String(formData.get("preapproval_id") ?? "");
  if (MP_ID_RE.test(pid)) await claimPreapproval(supabase, pid);

  let syncNote: string | null = null;
  try {
    const { data: s } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("mercadopago-claim", {
      body: {},
      headers: s.session ? { Authorization: `Bearer ${s.session.access_token}` } : undefined,
    });
    if (error) syncNote = "unavailable";
  } catch {
    syncNote = "unavailable";
  }

  const { data: acc } = await supabase
    .from("my_account")
    .select("subscription_status")
    .maybeSingle();

  revalidatePath("/conta");
  revalidatePath("/assinar/concluir");

  if (acc?.subscription_status === "active") {
    return { status: "active", message: "Pagamento confirmado! Seu acesso está liberado.", nonce };
  }
  return {
    status: "pending",
    message:
      syncNote === "unavailable"
        ? "Ainda não conseguimos confirmar o pagamento. O Mercado Pago pode levar alguns minutos; tente de novo em instantes. Se já passou de 15 minutos, fale com a gente."
        : "O Mercado Pago ainda não confirmou o pagamento. Tente de novo em instantes.",
    nonce,
  };
}
