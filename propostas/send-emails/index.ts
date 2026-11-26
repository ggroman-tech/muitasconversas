// ============================================================================
// PROPOSTA — NÃO DEPLOYADA. Edge function "send-emails" (Supabase, Deno).
// Esvazia a fila public.email_outbox (0089) enviando pelo Resend e grava o
// histórico em email_log. Requer: secrets RESEND_API_KEY e RESEND_FROM
// (ex.: "Muitas Conversas <contato@seudominio.com.br>", domínio verificado no
// Resend), e SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (já existem na função).
// Autenticação: header x-sync-secret igual ao secret do vault (mesmo padrão do
// mercadopago-sync). Deploy com verify_jwt=false por causa do header próprio.
// Sem RESEND_API_KEY a função não envia nada e marca nada: retorna 503.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const secret = req.headers.get("x-sync-secret") ?? "";
  const { data: ok } = await sb.rpc("mc_sync_secret_ok", { p: secret });
  if (!ok) return new Response("unauthorized", { status: 401 });

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!key || !from) return new Response("resend not configured", { status: 503 });

  const { data: rows, error } = await sb
    .from("email_outbox")
    .select("id, customer_id, loan_id, kind, dedupe_key, subject, body, attempts")
    .eq("status", "pending").lt("attempts", 5).order("created_at").limit(20);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, failed = 0;
  for (const m of rows ?? []) {
    const { data: c } = await sb.from("customers").select("email, anonymized_at").eq("id", m.customer_id).single();
    if (!c?.email || c.anonymized_at) {
      await sb.from("email_outbox").update({ status: "skipped", last_error: "sem e-mail" }).eq("id", m.id);
      continue;
    }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": m.dedupe_key },
      body: JSON.stringify({ from, to: [c.email], subject: m.subject, text: m.body }),
    });
    if (r.ok) {
      await sb.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id);
      await sb.from("email_log").upsert(
        { customer_id: m.customer_id, loan_id: m.loan_id, kind: m.kind, dedupe_key: m.dedupe_key, subject: m.subject, body_preview: m.body.slice(0, 200) },
        { onConflict: "dedupe_key", ignoreDuplicates: true });
      sent++;
    } else {
      const t = (await r.text()).slice(0, 300);
      await sb.from("email_outbox").update({ attempts: m.attempts + 1, last_error: `${r.status} ${t}`, status: m.attempts + 1 >= 5 ? "failed" : "pending" }).eq("id", m.id);
      failed++;
    }
  }
  return Response.json({ sent, failed });
});
