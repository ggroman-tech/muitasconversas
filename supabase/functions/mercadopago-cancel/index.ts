// "Cancelar assinatura": chamada pelo site com o JWT do cliente logado.
// 1) acha a assinatura DO PRÓPRIO cliente no banco (nunca aceita id vindo do navegador);
// 2) cancela no Mercado Pago (PUT /preapproval/{id} status=cancelled) — se o MP recusar, nada muda no banco;
// 3) aplica a resposta do MP (apply_mp_preapproval): a cobrança para e o acesso segue até o fim do período pago.
// Assinatura sem vínculo com o MP (nunca paga) é encerrada só no banco.
// Respostas (campo result): ok | already_canceled | nothing_to_cancel | not_configured | mp_error | error
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey, x-client-info" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");

async function mp(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${MP}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
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

    const { data: after } = await sb.from("subscriptions")
      .select("status,current_period_end,cancel_requested_at").eq("id", sub.id).maybeSingle();
    return json(200, { result: "ok", status: after?.status ?? null, current_period_end: after?.current_period_end ?? null, cancel_requested_at: after?.cancel_requested_at ?? null });
  } catch (e) {
    console.error("mercadopago-cancel falhou", (e as Error).message);
    return json(500, { result: "error" });
  }
});
