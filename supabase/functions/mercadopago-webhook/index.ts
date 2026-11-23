// Webhook do Mercado Pago (assinaturas). Autenticação: x-signature (HMAC-SHA256) + reconsulta à API oficial.
// A notificação nunca é confiada: só serve de gatilho; o estado vem de GET na API do Mercado Pago.
// Toda chamada é registrada em mp_webhook_log (sem corpo/segredos) para depuração. A consulta periódica (mercadopago-sync) é o caminho principal.
// Env: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");

const cut = (v: string | null) => (v ? v.slice(0, 64) : v); // limita o tamanho do que vem da URL antes de gravar no log
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function validSignature(req: Request, dataId: string | null, secret: string): Promise<boolean> {
  const header = req.headers.get("x-signature") ?? "";
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = parts["ts"], v1 = parts["v1"];
  if (!ts || !v1) return false;
  // janela de tempo: rejeita avisos muito antigos (o estado real é sempre relido da API do MP)
  const tsn = Number(ts);
  if (!Number.isFinite(tsn)) return false;
  if (Math.abs(Date.now() - (tsn > 1e12 ? tsn : tsn * 1000)) > 60 * 60 * 1000) return false;
  const requestId = req.headers.get("x-request-id");
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function mpGet(path: string, token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${MP}${path}`, { headers: { authorization: `Bearer ${token}` } });
  let body: any = null;
  try { body = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const entry: Record<string, unknown> = {
    topic: cut(url.searchParams.get("type") ?? url.searchParams.get("topic")),
    data_id: cut(url.searchParams.get("data.id")),
    has_signature: !!req.headers.get("x-signature"),
    has_request_id: !!req.headers.get("x-request-id"),
  };
  const done = async (status: number, body: unknown, outcome: string, detail?: string) => {
    try { await sb.from("mp_webhook_log").insert({ ...entry, http_status: status, outcome, detail: detail?.slice(0, 500) }); } catch { /* log é best-effort */ }
    return json(status, body);
  };

  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const token = cleanToken(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));
  if (!secret || !token) return done(500, { error: "not_configured" }, "not_configured", `secret=${!!secret} token=${!!token}`);

  const raw = await req.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return done(400, { error: "invalid_json" }, "invalid_json"); }

  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const topic: string = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  entry.topic = cut(topic) || entry.topic; entry.data_id = cut(dataId);
  const sigOk = await validSignature(req, url.searchParams.get("data.id") ?? dataId, secret);
  entry.sig_ok = sigOk;
  if (!sigOk) return done(401, { error: "invalid_signature" }, "invalid_signature");

  if (!dataId) return done(200, { result: "ignored", reason: "missing_data_id" }, "ignored", "missing_data_id");

  const { data: planRow } = await sb.from("settings").select("value").eq("key", "mp_plan_id").maybeSingle();
  const planId: string | null = planRow?.value ? String(planRow.value).replace(/^"|"$/g, "") : null;

  try {
    if (topic === "subscription_preapproval" || topic === "subscription_authorized_payment") {
      let preId = dataId;
      let ap: any = null;
      if (topic === "subscription_authorized_payment") {
        const r = await mpGet(`/authorized_payments/${encodeURIComponent(dataId)}`, token);
        if (r.status === 404) return done(200, { result: "ignored", reason: "authorized_payment_not_found" }, "ignored", "authorized_payment_not_found");
        if (r.status !== 200) throw new Error(`authorized_payments ${r.status}`);
        ap = r.body;
        preId = String(ap?.preapproval_id ?? "");
        if (!preId) return done(200, { result: "ignored", reason: "no_preapproval" }, "ignored", "no_preapproval");
      }
      const pr = await mpGet(`/preapproval/${encodeURIComponent(preId)}`, token);
      if (pr.status === 404) return done(200, { result: "ignored", reason: "preapproval_not_found" }, "ignored", "preapproval_not_found");
      if (pr.status !== 200) throw new Error(`preapproval ${pr.status}`);
      if (planId && pr.body?.preapproval_plan_id !== planId) {
        return done(200, { result: "ignored", reason: "other_plan" }, "ignored", "other_plan");
      }
      const a = await sb.rpc("apply_mp_preapproval", { p: pr.body });
      if (a.error) throw new Error(a.error.message);
      let result = a.data;
      if (ap) {
        const b = await sb.rpc("apply_mp_authorized_payment", { ap });
        if (b.error) throw new Error(b.error.message);
        result = b.data;
      }
      return done(200, result ?? { result: "ok" }, "applied", JSON.stringify(result ?? {}));
    }
    // payment / subscription_preapproval_plan e outros: reconhecidos; cada cobrança chega por subscription_authorized_payment.
    return done(200, { result: "ignored", reason: "topic_not_handled", topic }, "ignored", `topic_not_handled:${topic}`);
  } catch (e) {
    console.error("mercadopago-webhook falhou", (e as Error).message);
    return done(500, { error: "processing_failed" }, "error", (e as Error).message); // não-2xx: o Mercado Pago reenvia
  }
});
