// Consulta periódica ao Mercado Pago (caminho principal; webhook e URL de retorno são bônus).
// Chamada pelo pg_cron a cada 5 min com o header x-sync-secret (segredo no Vault, validado por mc_sync_secret_ok).
// Lista as assinaturas do plano e as cobranças (authorized_payments) e aplica via apply_mp_preapproval / apply_mp_authorized_payment (idempotentes).
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");

async function mpGet(path: string, token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${MP}${path}`, { headers: { authorization: `Bearer ${token}` } });
  let body: any = null;
  try { body = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, body };
}

// paged=false: endpoints que não aceitam limit/offset (ex.: /authorized_payments/search)
async function pages(pathBase: string, token: string, max = 10, paged = true): Promise<{ items: any[]; error?: string }> {
  const items: any[] = [];
  const limit = 50;
  for (let i = 0; i < max; i++) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const url = paged ? `${pathBase}${sep}limit=${limit}&offset=${i * limit}` : pathBase;
    const r = await mpGet(url, token);
    if (r.status !== 200) return { items, error: `${pathBase} -> HTTP ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}` };
    const res: any[] = r.body?.results ?? [];
    items.push(...res);
    if (!paged) break;
    const total = Number(r.body?.paging?.total ?? res.length);
    if (items.length >= total || res.length < limit) break;
  }
  return { items };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const ok = await sb.rpc("mc_sync_secret_ok", { p: req.headers.get("x-sync-secret") ?? "" });
  if (ok.error || ok.data !== true) return json(401, { error: "unauthorized" });

  const log = await sb.from("mp_sync_log").insert({}).select("id").single();
  const logId = log.data?.id as number | undefined;
  const finish = async (fields: Record<string, unknown>) => {
    if (logId) await sb.from("mp_sync_log").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", logId);
  };

  const token = cleanToken(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN"));
  if (!token) {
    await finish({ ok: false, error: "missing_access_token" });
    return json(500, { error: "missing_access_token", hint: "Salve MERCADOPAGO_ACCESS_TOKEN em Edge Functions > Secrets." });
  }
  // valida o token antes de tudo (não grava o valor)
  const me = await mpGet("/users/me", token);
  if (me.status === 401 || me.status === 403) {
    const kind = token.startsWith("TEST-") ? "token_de_teste" : token.startsWith("APP_USR-") ? "token_app_usr_recusado" : "formato_inesperado";
    await finish({ ok: false, error: `invalid_access_token (HTTP ${me.status}; ${kind}; len=${token.length})` });
    return json(500, { error: "invalid_access_token", hint: "O Mercado Pago recusou o Access Token salvo. Copie o Access Token de PRODUÇÃO da aplicação dona do plano (Suas integrações > Credenciais de produção) e salve de novo." });
  }

  const warnings: string[] = [];
  let nPre = 0, nPay = 0, nUnlinked = 0;
  try {
    const { data: planRow } = await sb.from("settings").select("value").eq("key", "mp_plan_id").maybeSingle();
    const planId: string | null = planRow?.value ? String(planRow.value).replace(/^"|"$/g, "") : null;

    const list = await pages(`/preapproval/search${planId ? `?preapproval_plan_id=${encodeURIComponent(planId)}` : ""}`, token);
    if (list.error) warnings.push(list.error);
    let subs = list.items;
    if (planId && subs.length === 0) { // filtro pode não valer: busca geral e filtra aqui
      const all = await pages(`/preapproval/search`, token);
      if (all.error) warnings.push(all.error);
      subs = all.items;
    }
    if (planId) subs = subs.filter((p) => p?.preapproval_plan_id === planId);

    for (const s of subs) {
      let full = s;
      if (!s?.payer_email) {
        const g = await mpGet(`/preapproval/${encodeURIComponent(String(s.id))}`, token);
        if (g.status === 200) full = g.body; else warnings.push(`preapproval ${s.id} -> HTTP ${g.status}`);
      }
      const aps = await pages(`/authorized_payments/search?preapproval_id=${encodeURIComponent(String(s.id))}`, token, 1, false);
      if (aps.error) warnings.push(aps.error);

      // e-mail do pagador: o MP deixa vazio na assinatura; vem no pagamento
      if (!full?.payer_email) {
        const pid = aps.items.map((ap: any) => ap?.payment?.id).find((x: unknown) => !!x);
        if (pid) {
          const pr = await mpGet(`/v1/payments/${encodeURIComponent(String(pid))}`, token);
          const em = pr.body?.payer?.email;
          if (pr.status === 200 && em) full = { ...full, payer_email: em };
          else if (pr.status !== 200) warnings.push(`payment ${pid} -> HTTP ${pr.status}`);
        }
      }

      const a = await sb.rpc("apply_mp_preapproval", { p: full });
      if (a.error) { warnings.push(`apply_mp_preapproval ${s.id}: ${a.error.message}`); continue; }
      nPre++;
      if (a.data?.result === "unlinked") nUnlinked++;

      for (const ap of aps.items) {
        const b = await sb.rpc("apply_mp_authorized_payment", { ap: { ...ap, preapproval_id: ap.preapproval_id ?? s.id } });
        if (b.error) warnings.push(`apply_mp_authorized_payment ${ap?.id}: ${b.error.message}`); else nPay++;
      }
    }
    await finish({ ok: warnings.length === 0, error: warnings.length ? warnings.join(" | ").slice(0, 1000) : null, preapprovals: nPre, payments: nPay, unlinked: nUnlinked, detail: { plan: planId, found: subs.length, mp_user: me.body?.id ?? null } });
    return json(200, { ok: warnings.length === 0, preapprovals: nPre, payments: nPay, unlinked: nUnlinked, warnings });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("mercadopago-sync falhou", msg);
    await finish({ ok: false, error: msg.slice(0, 500), preapprovals: nPre, payments: nPay });
    return json(500, { error: "sync_failed" });
  }
});
