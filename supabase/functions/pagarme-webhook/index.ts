// Edge Function (Deno): webhook do Pagar.me. Só valida a assinatura e delega a
// apply_pagarme_event(jsonb) (toda a regra de negócio vive em SQL — migração 0050_D_pagarme.sql).
// Env: PAGARME_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyPagarmeSignature } from "./hmac.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const raw = await req.text(); // corpo BRUTO: o HMAC é sobre estes bytes
  const secret = Deno.env.get("PAGARME_WEBHOOK_SECRET");
  if (!secret) return json(500, { error: "webhook_secret_not_configured" });

  const ok = await verifyPagarmeSignature(raw, req.headers.get("x-hub-signature"), secret);
  if (!ok) return json(401, { error: "invalid_signature" });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase.rpc("apply_pagarme_event", { event });
  if (error) {
    console.error("apply_pagarme_event falhou", error.message);
    return json(500, { error: "processing_failed" }); // não-2xx: o Pagar.me reenvia
  }
  return json(200, data ?? { result: "ok" });
});
