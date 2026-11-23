// "Verificar meu pagamento agora": chamada pelo site com o JWT do cliente logado.
// Consulta o Mercado Pago na hora (sem esperar webhook) e libera o acesso se o pagamento existir.
// Body: { preapproval_id?: string }. Sem preapproval_id, procura as assinaturas do plano pelo e-mail do cliente.
// Segurança: o e-mail do pagador no MP precisa ser igual ao e-mail de login; senão fica sem vínculo para a equipe resolver.
// Respostas (campo result): ok | already_linked | waiting_confirmation | not_found | invalid | email_mismatch | not_configured | mp_error | error
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey, x-client-info" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");

async function mpGet(path: string, token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${MP}${path}`, { headers: { authorization: `Bearer ${token}` } });
  let body: any = null;
  try { body = await r.json(); } catch { /* vazio */ }
  return { status: r.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  const email = u?.user?.email?.toLowerCase().trim();
  if (ue || !u?.user || !email) return json(401, { error: "not_authenticated" });

  const token = cleanToken(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));
  if (!token) return json(503, { result: "not_configured" });

  let body: any = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  const wanted: string | null = typeof body?.preapproval_id === "string" ? body.preapproval_id : null;
  if (wanted && !/^[A-Za-z0-9_-]{8,64}$/.test(wanted)) return json(200, { result: "invalid" });

  const { data: planRow } = await sb.from("settings").select("value").eq("key", "mp_plan_id").maybeSingle();
  const planId: string | null = planRow?.value ? String(planRow.value).replace(/^"|"$/g, "") : null;

  try {
    let found: any[] = [];
    if (wanted) {
      const g = await mpGet(`/preapproval/${encodeURIComponent(wanted)}`, token);
      if (g.status === 404) return json(200, { result: "not_found" });
      if (g.status === 401 || g.status === 403) return json(503, { result: "not_configured", reason: "invalid_access_token" });
      if (g.status !== 200) return json(502, { result: "mp_error", status: g.status });
      found = [g.body];
    } else {
      // o MP deixa payer_email vazio em planos com link hospedado: busca pelo plano e resolve o e-mail pelo pagamento
      const q = `/preapproval/search?limit=50${planId ? `&preapproval_plan_id=${encodeURIComponent(planId)}` : ""}`;
      const s = await mpGet(q, token);
      if (s.status === 401 || s.status === 403) return json(503, { result: "not_configured", reason: "invalid_access_token" });
      if (s.status !== 200) return json(502, { result: "mp_error", status: s.status });
      found = s.body?.results ?? [];
    }
    if (planId) found = found.filter((p) => p?.preapproval_plan_id === planId);
    if (!found.length) return json(200, { result: "waiting_confirmation" });

    let mismatch = false, last: any = null, applied = 0;
    for (const p0 of found) {
      let p = p0;
      if (!p?.payer_email) {
        const g = await mpGet(`/preapproval/${encodeURIComponent(String(p0.id))}`, token);
        if (g.status === 200) p = g.body;
      }
      const aps = await mpGet(`/authorized_payments/search?preapproval_id=${encodeURIComponent(String(p.id))}`, token);
      const items: any[] = aps.status === 200 ? (aps.body?.results ?? []) : [];
      if (!p?.payer_email) {
        const pid = items.map((ap: any) => ap?.payment?.id).find((x: unknown) => !!x);
        if (pid) {
          const pr = await mpGet(`/v1/payments/${encodeURIComponent(String(pid))}`, token);
          if (pr.status === 200 && pr.body?.payer?.email) p = { ...p, payer_email: pr.body.payer.email };
        }
      }
      const payer = String(p?.payer_email ?? "").toLowerCase().trim();
      if (payer && payer !== email) { mismatch = true; continue; } // não aplica por este usuário; o sync periódico trata e a equipe resolve
      const a = await sb.rpc("apply_mp_preapproval", { p });
      if (a.error) throw new Error(a.error.message);
      last = a.data;
      for (const ap of items) {
        const b = await sb.rpc("apply_mp_authorized_payment", { ap: { ...ap, preapproval_id: ap.preapproval_id ?? p.id } });
        if (b.error) throw new Error(b.error.message);
        last = b.data; applied++;
      }
    }
    if (mismatch && !last) return json(200, { result: "email_mismatch" });
    const { data: acc } = await sb.from("subscriptions").select("status,current_period_end").eq("customer_id", u.user.id).neq("status", "canceled").maybeSingle();
    return json(200, { result: last?.result ?? "ok", status: acc?.status ?? last?.status ?? null, current_period_end: acc?.current_period_end ?? null, payments_seen: applied });
  } catch (e) {
    console.error("mercadopago-claim falhou", (e as Error).message);
    return json(500, { result: "error" });
  }
});
