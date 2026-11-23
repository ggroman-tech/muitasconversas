// Webhook do Mercado Pago (assinaturas). Autenticação: x-signature (HMAC-SHA256) + reconsulta à API oficial.
// A notificação nunca é confiada: só serve de gatilho; o estado vem de GET na API do Mercado Pago.
// Env: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!secret || !token) return json(500, { error: "not_configured" });

  const url = new URL(req.url);
  const raw = await req.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { error: "invalid_json" }); }

  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  if (!(await validSignature(req, url.searchParams.get("data.id") ?? dataId, secret))) {
    return json(401, { error: "invalid_signature" });
  }

  const topic: string = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  if (!dataId) return json(200, { result: "ignored", reason: "missing_data_id" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: planRow } = await sb.from("settings").select("value").eq("key", "mp_plan_id").maybeSingle();
  const planId: string | null = planRow?.value ? String(planRow.value) : null;

  try {
    if (topic === "subscription_preapproval" || topic === "subscription_authorized_payment") {
      let preId = dataId;
      let ap: any = null;
      if (topic === "subscription_authorized_payment") {
        const r = await mpGet(`/authorized_payments/${encodeURIComponent(dataId)}`, token);
        if (r.status === 404) return json(200, { result: "ignored", reason: "authorized_payment_not_found" });
        if (r.status !== 200) throw new Error(`authorized_payments ${r.status}`);
        ap = r.body;
        preId = String(ap?.preapproval_id ?? "");
        if (!preId) return json(200, { result: "ignored", reason: "no_preapproval" });
      }
      const pr = await mpGet(`/preapproval/${encodeURIComponent(preId)}`, token);
      if (pr.status === 404) return json(200, { result: "ignored", reason: "preapproval_not_found" });
      if (pr.status !== 200) throw new Error(`preapproval ${pr.status}`);
      if (planId && pr.body?.preapproval_plan_id !== planId) {
        return json(200, { result: "ignored", reason: "other_plan" });
      }
      const a = await sb.rpc("apply_mp_preapproval", { p: pr.body });
      if (a.error) throw new Error(a.error.message);
      let result = a.data;
      if (ap) {
        const b = await sb.rpc("apply_mp_authorized_payment", { ap });
        if (b.error) throw new Error(b.error.message);
        result = b.data;
      }
      return json(200, result ?? { result: "ok" });
    }
    // payment / subscription_preapproval_plan e outros: reconhecidos; cada cobrança chega por subscription_authorized_payment.
    return json(200, { result: "ignored", reason: "topic_not_handled", topic });
  } catch (e) {
    console.error("mercadopago-webhook falhou", (e as Error).message);
    return json(500, { error: "processing_failed" }); // não-2xx: o Mercado Pago reenvia
  }
});
