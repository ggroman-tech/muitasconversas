// Consulta periódica ao Mercado Pago (caminho principal; webhook e URL de retorno são bônus).
// Chamada pelo pg_cron (proposta go-live: a cada 10 min) com o header x-sync-secret (segredo no Vault, validado por mc_sync_secret_ok).
// Lista as assinaturas do plano e as cobranças (authorized_payments) e aplica via apply_mp_preapproval / apply_mp_authorized_payment (idempotentes).
// O MP não devolve o e-mail do pagador em planos com link hospedado: ele é obtido pelo pagamento (GET /v1/payments/{id}).
// Go-live (A7): retry com espera exponencial em HTTP 429 (máx. 3 tentativas), timeout nos fetch, prioridade para
// assinaturas ativas/pendentes, assinaturas já canceladas só reaplicam o estado (sem consultar cobranças) e orçamento de tempo.
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_TRIES = 3;          // 1 tentativa + 2 repetições em 429/erro de rede
const TIME_BUDGET_MS = 100_000; // acima disso, para e registra (o próximo ciclo continua)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const cleanToken = (t: string | undefined) => (t ?? "").trim().replace(/^bearer\s+/i, "").replace(/^"|"$/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let retries429 = 0;

async function mpGet(path: string, token: string): Promise<{ status: number; body: any }> {
  let last: { status: number; body: any } = { status: 0, body: null };
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(`${MP}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: ctl.signal });
      let body: any = null;
      try { body = await r.json(); } catch { /* corpo vazio */ }
      last = { status: r.status, body };
      if (r.status !== 429) return last;
      retries429++;
      if (attempt < MAX_TRIES) {
        const ra = Number(r.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 1000 * 2 ** (attempt - 1); // 1s, 2s
        await sleep(wait + Math.floor(Math.random() * 300));
      }
    } catch {
      last = { status: 0, body: null }; // timeout/erro de rede: tenta de novo
      if (attempt < MAX_TRIES) await sleep(1000 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
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

// ordem de prioridade: quem ainda pode mudar (pendente/ativa/pausada) primeiro; canceladas por último
const rank = (s: any) => {
  const st = String(s?.status ?? "");
  if (st === "pending") return 0;
  if (st === "authorized") return 1;
  if (st === "paused") return 2;
  return 3; // cancelled, finished etc.
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const t0 = Date.now();
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
  if (me.status === 429 || me.status === 0 || me.status >= 500) {
    await finish({ ok: false, error: `mp_unavailable (users/me HTTP ${me.status}; retries429=${retries429})` });
    return json(200, { ok: false, error: "mp_unavailable", status: me.status });
  }

  const warnings: string[] = [];
  let nPre = 0, nPay = 0, nUnlinked = 0, nSkipped = 0;
  try {
    const { data: planRow } = await sb.from("settings").select("value").eq("key", "mp_plan_id").maybeSingle();
    const planId: string | null = planRow?.value ? String(planRow.value).replace(/^"|"$/g, "") : null;
    const { data: priceRow } = await sb.from("settings").select("value").eq("key", "plan_price_cents").maybeSingle();
    const priceCents = Number(priceRow?.value);

    const list = await pages(`/preapproval/search${planId ? `?preapproval_plan_id=${encodeURIComponent(planId)}` : ""}`, token);
    if (list.error) warnings.push(list.error);
    let subs = list.items;
    if (planId && subs.length === 0 && !list.error) { // filtro pode não valer: busca geral e filtra aqui
      const all = await pages(`/preapproval/search`, token);
      if (all.error) warnings.push(all.error);
      subs = all.items;
    }
    if (planId) subs = subs.filter((p) => p?.preapproval_plan_id === planId);
    subs = [...subs].sort((a, b) => rank(a) - rank(b));

    for (const s of subs) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { nSkipped = subs.length - nPre; warnings.push(`time_budget: ${nSkipped} assinatura(s) ficam para o próximo ciclo`); break; }

      // assinatura já cancelada: só reaplica o estado vindo da busca (sem consultar cobranças/pagamentos)
      if (rank(s) === 3) {
        const a = await sb.rpc("apply_mp_preapproval", { p: s });
        if (a.error) warnings.push(`apply_mp_preapproval ${s.id}: ${a.error.message}`); else { nPre++; if (a.data?.result === "unlinked") nUnlinked++; }
        continue;
      }

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
        // L1 (Financeiro): o banco não valida o valor cobrado. Aviso visível em mp_sync_log quando difere do preço configurado.
        const amt = Number(ap?.transaction_amount);
        if (Number.isFinite(priceCents) && priceCents > 0 && Number.isFinite(amt) && ap?.status !== "cancelled" && Math.round(amt * 100) !== priceCents) {
          warnings.push(`amount_mismatch preapproval ${s.id} cobranca ${ap?.id}: MP=${amt} site=${priceCents / 100}`);
        }
        const b = await sb.rpc("apply_mp_authorized_payment", { ap: { ...ap, preapproval_id: ap.preapproval_id ?? s.id } });
        if (b.error) warnings.push(`apply_mp_authorized_payment ${ap?.id}: ${b.error.message}`); else nPay++;
      }
    }
    await finish({
      ok: warnings.length === 0,
      error: warnings.length ? warnings.join(" | ").slice(0, 1000) : null,
      preapprovals: nPre, payments: nPay, unlinked: nUnlinked,
      detail: { plan: planId, found: subs.length, mp_user: me.body?.id ?? null, retries429, skipped: nSkipped, ms: Date.now() - t0 },
    });
    return json(200, { ok: warnings.length === 0, preapprovals: nPre, payments: nPay, unlinked: nUnlinked, retries429, warnings });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("mercadopago-sync falhou", msg);
    await finish({ ok: false, error: msg.slice(0, 500), preapprovals: nPre, payments: nPay });
    return json(500, { error: "sync_failed" });
  }
});
