"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";

export type CancelSubscriptionState = { status: "idle" | "ok" | "error"; message?: string };

const REFUND_FAILED_MESSAGE =
  "Cancelamos a assinatura e não haverá novas cobranças, mas não conseguimos registrar o reembolso agora. Nossa equipe vai conferir e devolver o valor; se preferir, fale com a gente.";

/**
 * Cancela a assinatura do cliente logado: a Edge Function mercadopago-cancel cancela no
 * Mercado Pago (a cobrança para) e o acesso segue até o fim do período já pago.
 * O id da assinatura NUNCA vem do navegador: a função usa o JWT da sessão.
 */
export async function cancelSubscription(
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  _prev: CancelSubscriptionState,
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  _formData: FormData,
): Promise<CancelSubscriptionState> {
  if (!(await getAuthUser())) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { status: "error", message: "Sua sessão expirou. Entre novamente." };

  const { data, error } = await supabase.functions.invoke("mercadopago-cancel", {
    body: {},
    headers: { Authorization: `Bearer ${s.session.access_token}` },
  });
  const result = (data as { result?: string } | null)?.result;

  if (!error && result === "refund_failed") {
    // cancelado no Mercado Pago, mas o estorno automático não passou: a equipe resolve (nada de nova cobrança)
    revalidatePath("/conta");
    revalidatePath("/assinar/concluir");
    return { status: "ok", message: REFUND_FAILED_MESSAGE };
  }
  if (!error && (result === "ok" || result === "ok_refunded" || result === "nothing_to_cancel")) {
    revalidatePath("/conta");
    revalidatePath("/assinar/concluir");
    return {
      status: "ok",
      message:
        result === "nothing_to_cancel"
          ? "Você não tem assinatura para cancelar."
          : result === "ok_refunded"
            ? "Assinatura cancelada e valor devolvido por inteiro. O estorno aparece na fatura do cartão em alguns dias, conforme o banco. Não haverá novas cobranças."
            : "Assinatura cancelada. Não haverá novas cobranças.",
    };
  }
  return {
    status: "error",
    message:
      "Não conseguimos cancelar agora e nada foi alterado. Tente de novo em instantes ou fale com a gente.",
  };
}
