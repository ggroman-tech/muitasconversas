import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentInfo } from "./state";

type LooseClient = {
  rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
const loose = (sb: SupabaseClient<never> | object) => sb as unknown as LooseClient;

/** RPC my_payment_state() (CONTRATO-FRONT-BACK.md). Tolerante: se ainda não existir, devolve null. */
export async function getPaymentInfo(sb: object): Promise<PaymentInfo> {
  try {
    const { data, error } = await loose(sb).rpc("my_payment_state");
    if (error || !data || typeof data !== "object") return null;
    return data as PaymentInfo;
  } catch {
    return null;
  }
}

/** Reivindica no banco a assinatura do Mercado Pago devolvida na URL de retorno. */
export async function claimPreapproval(sb: object, preapprovalId: string): Promise<string | null> {
  try {
    const { data } = await loose(sb).rpc("claim_mp_preapproval", { p_id: preapprovalId });
    return (data as { result?: string } | null)?.result ?? null;
  } catch {
    return null;
  }
}

export const MP_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
