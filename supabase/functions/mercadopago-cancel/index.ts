// "Cancelar assinatura": chamada pelo site com o JWT do cliente logado.
// 1) acha a assinatura DO PRÓPRIO cliente no banco (nunca aceita id vindo do navegador);
// 2) cancela no Mercado Pago (PUT /preapproval/{id} status=cancelled) — se o MP recusar, nada muda no banco;
// 3) aplica a resposta do MP (apply_mp_preapproval): a cobrança para e o acesso segue até o fim do período pago.
// Assinatura sem vínculo com o MP (nunca paga) é encerrada só no banco.
// REEMBOLSO DE 7 DIAS (decisão do Gabriel, 25/11): se o cliente é elegível (mc_refund_eligibility: 1ª assinatura, 1ª cobrança há <= 7 dias),
// depois de cancelar no MP esta função devolve o valor total (POST /v1/payments/{id}/refunds, sem body = total, com X-Idempotency-Key),
// registra em mp_record_refund (acesso termina na hora) e responde ok_refunded. Se o reembolso falhar o cancelamento VALE, o erro é
// gravado, abre alerta para a equipe (email_log refund_failed) e a resposta é refund_failed (o site deve avisar que o reembolso será feito manualmente).
// Respostas (campo result): ok | ok_refunded | refund_failed | already_canceled | nothing_to_cancel | not_configured | mp_error | error
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
// CORS restrito ao domínio do site (A9). As chamadas reais vêm de Server Actions (servidor), então não dependem de CORS.
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://muitasconversas.vercel.app";
const cors = { "access-control-allow-origin": SITE_ORIGIN, "vary": "origin", "access-control-allow-headers": "authorization, content-type, apikey, x-client-info" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");

async function mp(method: string, path: string, token: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const r = await fetch(`${MP}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  let b: any = null;
  try { b = await r.json(); } catch { /* vazio */ }
  return { status: r.status, body: b };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  if (ue || !u?.user) return json(401, { error: "not_authenticated" });
  const uid = u.user.id;

  try {
    const { data: sub, error: se } = await sb.from("subscriptions")
      .select("id,status,current_period_end,mp_preapproval_id,cancel_requested_at")
      .eq("customer_id", uid).neq("status", "canceled").maybeSingle();
    if (se) throw new Error(se.message);
    if (!sub) return json(200, { result: "nothing_to_cancel" });

    // nunca paga / sem vínculo com o MP: encerra só no banco
    if (!sub.mp_preapproval_id) {
      if (sub.status === "active") return json(200, { result: "error", reason: "active_without_mp_link" }); // não deveria existir; equipe resolve
      const { error } = await sb.from("subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_requested_at: new Date().toISOString() })
        .eq("id", sub.id).eq("customer_id", uid);
      if (error) throw new Error(error.message);
      return json(200, { result: "ok", status: "canceled", current_period_end: null });
    }

    const token = cleanToken(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));
    if (!token) return json(503, { result: "not_configured" });

    const id = String(sub.mp_preapproval_id);
    // elegibilidade ao reembolso de 7 dias, calculada ANTES de cancelar (estado que o cliente viu)
    const el = await sb.rpc("mc_refund_eligibility", { p_customer: uid });
    const elig = el.error ? null : el.data;
    let r = await mp("PUT", `/preapproval/${encodeURIComponent(id)}`, token, { status: "cancelled" });
    if (r.status === 401 || r.status === 403) return json(503, { result: "not_configured", reason: "invalid_access_token" });
    if (r.status !== 200) {
      // pode já estar cancelada lá: confirma lendo o estado real
      const g = await mp("GET", `/preapproval/${encodeURIComponent(id)}`, token);
      if (g.status === 200 && g.body?.status === "cancelled") r = g; else return json(502, { result: "mp_error", status: r.status });
    }
    if (r.body?.status !== "cancelled") {
      const g = await mp("GET", `/preapproval/${encodeURIComponent(id)}`, token);
      if (g.status !== 200 || g.body?.status !== "cancelled") return json(502, { result: "mp_error", reason: "not_cancelled_at_mp" });
      r = g;
    }

    // o MP deixa o e-mail do pagador vazio: preserva o que já está no banco (apply faz coalesce)
    const a = await sb.rpc("apply_mp_preapproval", { p: { ...r.body, id } });
    if (a.error) throw new Error(a.error.message);
    if (a.data?.result && a.data.result !== "ok") return json(200, { result: "error", reason: "not_applied" }); // cancelado no MP, mas o banco não refletiu: equipe resolve

    // reembolso de 7 dias (só se elegível): o cancelamento já vale; falha aqui NUNCA desfaz o cancelamento
    let refund: { ok: boolean; detail?: string } | null = null;
    if (elig?.eligible === true && typeof elig.payment_id === "string") {
      const payId = String(elig.payment_id);
      if (payId.startsWith("ap:")) {
        refund = { ok: false, detail: "payment_id_unavailable (cobranca sem id de pagamento)" };
      } else {
        const rf = await mp("POST", `/v1/payments/${encodeURIComponent(payId)}/refunds`, token, {}, { "x-idempotency-key": `mc-refund-${payId}` });
        refund = (rf.status === 200 || rf.status === 201)
          ? { ok: true }
          : { ok: false, detail: `HTTP ${rf.status} ${rf.body?.error ?? ""} ${rf.body?.message ?? ""}`.trim().slice(0, 200) };
      }
      const rec = await sb.rpc("mp_record_refund", { p_customer: uid, p_payment_id: payId, p_ok: refund.ok, p_detail: refund.detail ?? null });
      if (rec.error) console.error("mp_record_refund falhou", rec.error.message); // se o MP já devolveu, o sync reconcilia o estorno depois
      if (refund.ok) return json(200, { result: "ok_refunded", status: "canceled", current_period_end: null, refunded_amount_cents: elig.amount_cents ?? null });
    }

    const { data: after } = await sb.from("subscriptions")
      .select("status,current_period_end,cancel_requested_at").eq("id", sub.id).maybeSingle();
    if (refund && !refund.ok) {
      return json(200, { result: "refund_failed", canceled: true, status: after?.status ?? null, current_period_end: after?.current_period_end ?? null, cancel_requested_at: after?.cancel_requested_at ?? null });
    }
    return json(200, { result: "ok", status: after?.status ?? null, current_period_end: after?.current_period_end ?? null, cancel_requested_at: after?.cancel_requested_at ?? null });
  } catch (e) {
    console.error("mercadopago-cancel falhou", (e as Error).message);
    return json(500, { result: "error" });
  }
});
