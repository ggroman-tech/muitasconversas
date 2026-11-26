// Cria o PLANO DE ASSINATURA no Mercado Pago com o token salvo em MERCADOPAGO_ACCESS_TOKEN e grava settings.mp_plan_id.
// Uso: administrador/rotina via POST com o header x-sync-secret (mesmo segredo do sync, validado por mc_sync_secret_ok).
// Corpo (opcional): { amount?: number (padrão 1), reason?: string, allow_production?: boolean }.
// Trava de segurança: só cria se a conta do token for uma conta de TESTE (nickname TEST*), a não ser que allow_production=true.
// Não devolve nem registra o token.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ok = await sb.rpc("mc_sync_secret_ok", { p: req.headers.get("x-sync-secret") ?? "" });
  if (ok.error || ok.data !== true) return json(401, { error: "unauthorized" });

  const token = cleanToken(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));
  if (!token) return json(500, { error: "missing_access_token" });

  let body: any = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  const amount = Number(body?.amount ?? 1);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) return json(400, { error: "invalid_amount" });
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 120) : "Muitas Conversas — assinatura mensal";

  const me = await mp("GET", "/users/me", token);
  if (me.status === 401 || me.status === 403) return json(503, { error: "invalid_access_token" });
  if (me.status !== 200) return json(502, { error: "mp_error", step: "users_me", status: me.status });
  const nick = String(me.body?.nickname ?? "");
  const isTest = /^TEST/i.test(nick);
  if (!isTest && body?.allow_production !== true) {
    return json(409, { error: "not_a_test_account", hint: "O token salvo não é de uma conta de teste. Nada foi criado.", mp_user_id: me.body?.id ?? null });
  }

  const site = "https://muitasconversas.vercel.app";
  const created = await mp("POST", "/preapproval_plan", token, {
    reason,
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: amount, currency_id: "BRL" },
    payment_methods_allowed: { payment_types: [{ id: "credit_card" }], payment_methods: [] },
    back_url: `${site}/assinar/concluir`,
  });
  if (created.status !== 201 && created.status !== 200) {
    return json(502, { error: "mp_error", step: "create_plan", status: created.status, message: created.body?.message ?? null, cause: created.body?.cause ?? null });
  }
  const planId = String(created.body?.id ?? "");
  if (!planId) return json(502, { error: "mp_error", step: "no_plan_id" });

  // settings.value é jsonb: grava o texto direto (vira um jsonb string), sem aspas extras
  const up = await sb.from("settings").update({ value: planId }).eq("key", "mp_plan_id");
  if (up.error) return json(500, { error: "settings_update_failed", plan_id: planId, detail: up.error.message });

  return json(200, { ok: true, test_account: isTest, mp_user_id: me.body?.id ?? null, plan_id: planId, init_point: created.body?.init_point ?? null, amount });
});
