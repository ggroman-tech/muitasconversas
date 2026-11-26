-- ============================================================================
-- PROPOSTA 0089 — NÃO APLICADA (testada em rollback)
-- Problema: a migration 0086 grava 'payment_after_cancel' (e 0078 grava
-- 'payment_failed') em email_log. email_log é o histórico de e-mails ENVIADOS e a
-- tela Minha conta mostra o assunto desses registros ao cliente ("Últimos e-mails
-- enviados"). Ou seja: texto interno ("conferir/estornar") aparece para o cliente
-- e dá a impressão de e-mail enviado quando NÃO existe nenhum enviador.
-- O que faz: cria staff_alerts (alertas internos, só equipe lê) e email_outbox
-- (fila de e-mails ao cliente; quem envia grava depois em email_log). Redireciona
-- em mp_reconcile: falha de pagamento -> fila; pagamento pós-cancelamento -> alerta.
-- Novos alertas (itens 6 e 7): amount_mismatch (valor != plano) e
-- duplicate_subscription (cliente com 2ª assinatura no MP; mensagem traz o que fazer).
-- Risco: baixo-médio (reescreve mp_reconcile por replace; falha com exceção se o
-- texto esperado não existir). Ordem: depois da 0088.
-- Teste (rodado): valor 5000 vs plano 100 -> 1 alerta; pagamento após cancelar ->
--   1 alerta e 0 e-mail_log; rejeitado -> 1 linha no outbox; 2º preapproval com o
--   mesmo e-mail -> result 'duplicate' + 1 alerta.
-- Painel: falta uma tela para a equipe ler staff_alerts (sugestão em INDEX).
-- ============================================================================
create table if not exists public.staff_alerts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  customer_id uuid references public.customers(id) on delete set null,
  ref text,
  message text not null,
  dedupe_key text not null unique,
  resolved_at timestamptz
);
alter table public.staff_alerts enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff_alerts' and policyname='staff_alerts_select_staff') then
    create policy staff_alerts_select_staff on public.staff_alerts for select to authenticated using ((select mc_is_staff('admin','ops')));
  end if;
end $p$;
revoke all on public.staff_alerts from anon, authenticated;
grant select on public.staff_alerts to authenticated;

create table if not exists public.email_outbox (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  loan_id uuid references public.loans(id) on delete set null,
  kind text not null,
  dedupe_key text not null unique,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz
);
create index if not exists email_outbox_pending_idx on public.email_outbox (created_at) where status = 'pending';
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

create or replace function public.mc_staff_alert(p_kind text, p_customer uuid, p_ref text, p_message text, p_dedupe text)
returns void language sql security definer set search_path to 'public','pg_temp' as $f$
  insert into staff_alerts(kind, customer_id, ref, message, dedupe_key)
  values (p_kind, p_customer, p_ref, p_message, p_dedupe) on conflict (dedupe_key) do nothing;
$f$;
revoke all on function public.mc_staff_alert(text, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.mc_queue_email(p_customer uuid, p_kind text, p_dedupe text, p_subject text, p_body text, p_loan uuid default null)
returns void language sql security definer set search_path to 'public','pg_temp' as $f$
  insert into email_outbox(customer_id, loan_id, kind, dedupe_key, subject, body)
  select p_customer, p_loan, p_kind, p_dedupe, p_subject, p_body
   where not exists (select 1 from email_log where dedupe_key = p_dedupe)
  on conflict (dedupe_key) do nothing;
$f$;
revoke all on function public.mc_queue_email(uuid, text, text, text, text, uuid) from public, anon, authenticated;

do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.mp_reconcile(text)'::regprocedure);
  n := replace(d, 'v_cust uuid;', 'v_cust uuid; v_dup subscriptions%rowtype;');
  n := replace(n, $o$      insert into email_log(customer_id, kind, dedupe_key, subject)
      values (v_sub.customer_id, 'payment_failed', 'payment_failed:mp:' || v_pay.id, 'Falha no pagamento da assinatura')
      on conflict (dedupe_key) do nothing;$o$,
$o$      perform mc_queue_email(v_sub.customer_id, 'payment_failed', 'payment_failed:mp:' || v_pay.id,
        'Não conseguimos cobrar a sua assinatura',
        'Olá! O pagamento da sua assinatura do Muitas Conversas não foi aprovado. O Mercado Pago tenta de novo nos próximos dias; você também pode conferir ou trocar o cartão pelo próprio Mercado Pago. Se precisar de ajuda, é só responder este e-mail.');$o$);
  n := replace(n, $o$        insert into email_log(customer_id, kind, dedupe_key, subject)
        values (v_sub.customer_id, 'payment_after_cancel', 'pac:' || v_pay.id, 'Pagamento aprovado após cancelamento (conferir/estornar)')
        on conflict (dedupe_key) do nothing;$o$,
$o$        perform mc_staff_alert('payment_after_cancel', v_sub.customer_id, v_pay.id,
          'Pagamento aprovado depois do pedido de cancelamento. Conferir no Mercado Pago e, se for o caso, estornar.', 'pac:' || v_pay.id);$o$);
  n := replace(n, $o$    if v_pay.status = 'approved' then
$o$, $o$    if v_pay.status = 'approved' then
      if coalesce(v_pay.amount_cents, 0) is distinct from coalesce((select (s.value #>> '{}')::int from settings s where s.key = 'plan_price_cents'), 0) then
        perform mc_staff_alert('amount_mismatch', v_sub.customer_id, v_pay.id,
          'Pagamento de ' || coalesce(v_pay.amount_cents, 0) || ' centavos diferente do valor do plano. Conferir no Mercado Pago.', 'amt:' || v_pay.id);
      end if;
$o$);
  n := replace(n, $o$  if v_sub.id is null then return jsonb_build_object('result','unlinked','preapproval',p_pre); end if;$o$,
$o$  if v_sub.id is null and v_pre.payer_email is not null and v_pre.status = 'authorized' then
    select s.* into v_dup from subscriptions s join customers c on c.id = s.customer_id
     where c.email = lower(btrim(v_pre.payer_email))::citext and s.status <> 'canceled'
       and s.mp_preapproval_id is not null and s.mp_preapproval_id <> p_pre limit 1;
    if found then
      perform mc_staff_alert('duplicate_subscription', v_dup.customer_id, p_pre,
        'Cliente já tem a assinatura ' || v_dup.mp_preapproval_id || ' e criou outra (' || p_pre || '). Cancele a duplicada no painel do Mercado Pago (Assinaturas > ' || p_pre || ' > Cancelar) e estorne se houve cobrança.', 'dup:' || p_pre);
      return jsonb_build_object('result','duplicate','preapproval',p_pre);
    end if;
  end if;
  if v_sub.id is null then return jsonb_build_object('result','unlinked','preapproval',p_pre); end if;$o$);
  if n = d or position('mc_queue_email' in n) = 0 or position('payment_after_cancel' in n) = 0 or position('amount_mismatch' in n) = 0 or position('duplicate_subscription' in n) = 0 or position('v_dup subscriptions' in n) = 0 then
    raise exception 'patch mp_reconcile nao aplicado';
  end if;
  execute n;
end $m$;
