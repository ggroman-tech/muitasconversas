-- ============================================================================
-- 0098 — Carência de pagamento (3 dias) + estorno/chargeback tiram o acesso.  (NÃO aplicada; testada em rollback)
-- Decisões do Gabriel (25/11 22h11): carência de 3 dias; estorno e chargeback revogam o acesso.
-- Depende de 0085-0088 (já aplicadas). NÃO depende da 0089 (alertas vão para email_log, como payment_failed).
-- Idempotente: pode rodar duas vezes (cada patch confere se já está aplicado).
-- Desligar a carência sem desfazer nada: update settings set value='0' where key='payment_grace_days';
--
-- CARÊNCIA: durante N dias depois de current_period_end o cliente continua ACTIVE e pode reservar/agendar.
--   • cobrança recusada dentro da carência NÃO muda o status (continua active; registra payment_failed);
--   • depois da carência o cron diário (mc_expire_subscriptions) passa para past_due;
--   • pagamento aprovado dentro da carência soma 30 dias sobre o fim ANTERIOR do período (não sobre hoje);
--   • cancelamento pedido NÃO tem carência (acesso termina na data exata).
-- ESTORNO/CHARGEBACK (payment.status refunded | charged_back vindo do MP, depois de um approved já aplicado):
--   • payments.status = 'refunded'; mp_payments.reversed_at marca (idempotente);
--   • acesso revogado na hora: status past_due (ou canceled se já havia cancelamento) e current_period_end = ontem;
--     se existir um pagamento aprovado MAIS NOVO e não estornado, só retira 30 dias (1 ciclo) daquele ciclo;
--   • reservas na fila/ofertadas são canceladas e as cópias seguradas voltam a 'available' (mc_release_access);
--   • alerta 'payment_reversed' em email_log (dedupe 'rev:<id>').
-- Limites: reembolso PARCIAL no MP mantém status approved (ignorado; a equipe decide); empréstimos já entregues não são tocados.
-- ============================================================================
insert into public.settings(key, value) values ('payment_grace_days', '3'::jsonb) on conflict (key) do nothing;
alter table public.mp_payments add column if not exists reversed_at timestamptz;

-- ---------- helpers ----------
create or replace function public.mc_period_ok(p_end date, p_cancel timestamptz)
returns boolean language sql stable set search_path to 'public','pg_temp' as $f$
  select p_end is null
      or p_end + (case when p_cancel is null then coalesce(mc_setting_int('payment_grace_days'), 0) else 0 end)
         >= (now() at time zone 'America/Sao_Paulo')::date;
$f$;

-- cancela reservas na fila/ofertadas do cliente e devolve as cópias seguradas (mesma lógica do encerramento em mc_expire_subscriptions)
create or replace function public.mc_release_access(p_customer uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_copies uuid[]; v_books uuid[]; v_b uuid;
begin
  with c as (
    update reservations set status = 'canceled', closed_at = now()
     where customer_id = p_customer and status in ('queued','offered')
    returning book_id, offered_copy_id)
  select coalesce(array_agg(offered_copy_id) filter (where offered_copy_id is not null), '{}'),
         coalesce(array_agg(distinct book_id), '{}')
    into v_copies, v_books from c;
  update copies set status = 'available' where id = any(v_copies) and status = 'held';
  foreach v_b in array v_books loop perform mc_promote_queue(v_b); end loop;
end $f$;
revoke all on function public.mc_release_access(uuid) from public, anon, authenticated;

-- aplica estornos/chargebacks já registrados em mp_payments para o preapproval (idempotente via reversed_at)
create or replace function public.mp_apply_reversals(p_pre text)
returns int language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare
  r mp_payments%rowtype; v_pre mp_preapprovals%rowtype; v_sub subscriptions%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_other boolean; v_end date; v_closed boolean; n int := 0;
begin
  select * into v_pre from mp_preapprovals where id = p_pre;
  if not found or v_pre.subscription_id is null then return 0; end if;
  for r in select * from mp_payments
            where preapproval_id = p_pre and status in ('refunded','charged_back') and applied and reversed_at is null
            order by id for update loop
    select * into v_sub from subscriptions where id = v_pre.subscription_id for update;
    update payments set status = 'refunded' where mp_payment_id = r.id and status <> 'refunded';
    if v_sub.status <> 'canceled' then
      v_closed := (v_pre.status = 'cancelled' or v_sub.cancel_requested_at is not null);
      v_other := exists (select 1 from mp_payments o
                          where o.preapproval_id = p_pre and o.id <> r.id and o.status = 'approved' and o.applied
                            and o.reversed_at is null and o.paid_at > r.paid_at);
      if v_other then
        v_end := case when v_sub.current_period_end is null then null else v_sub.current_period_end - 30 end;   -- só aquele ciclo
      else
        v_end := v_today - 1;                                                                                  -- sem mais nada pago: acesso acaba agora
      end if;
      if v_end is null or v_end >= v_today then
        update subscriptions set current_period_end = v_end where id = v_sub.id;
      else
        update subscriptions
           set current_period_end = v_end,
               status = (case when v_closed then 'canceled' else 'past_due' end)::subscription_status,
               canceled_at = case when v_closed then coalesce(canceled_at, now()) else canceled_at end
         where id = v_sub.id;
        perform mc_release_access(v_sub.customer_id);
      end if;
    end if;
    update mp_payments set reversed_at = now() where id = r.id;
    insert into email_log(customer_id, kind, dedupe_key, subject)
    values (v_sub.customer_id, 'payment_reversed', 'rev:' || r.id,
            'Pagamento ' || r.id || ' ficou como ' || r.status || ' no Mercado Pago: acesso retirado (conferir o caso)')
    on conflict (dedupe_key) do nothing;
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function public.mp_apply_reversals(text) from public, anon, authenticated;

-- ---------- patches das funções existentes ----------
do $m$
declare d text; n text;
begin
  -- reservar / fila: só quem está no período (com carência) ---------------------------------
  d := pg_get_functiondef('public.reserve_book(uuid)'::regprocedure);
  if position('mc_period_ok' in d) = 0 then
    n := replace(d, $o$status = 'active' and (current_period_end is null or current_period_end >= (now() at time zone 'America/Sao_Paulo')::date)$o$,
                    $o$status = 'active' and mc_period_ok(current_period_end, cancel_requested_at)$o$);
    if n = d then raise exception 'patch reserve_book nao aplicado'; end if;
    execute n;
  end if;

  d := pg_get_functiondef('public.mc_promote_queue(uuid)'::regprocedure);
  if position('mc_period_ok' in d) = 0 then
    n := replace(d, $o$s.status = 'active' and (s.current_period_end is null or s.current_period_end >= (now() at time zone 'America/Sao_Paulo')::date)$o$,
                    $o$s.status = 'active' and mc_period_ok(s.current_period_end, s.cancel_requested_at)$o$);
    if n = d then raise exception 'patch mc_promote_queue nao aplicado'; end if;
    execute n;
  end if;

  -- cron diário: past_due só depois da carência ---------------------------------------------
  d := pg_get_functiondef('public.mc_expire_subscriptions()'::regprocedure);
  if position('payment_grace_days' in d) = 0 then
    n := replace(d, $o$where status = 'active' and cancel_requested_at is null and current_period_end < v_today;$o$,
                    $o$where status = 'active' and cancel_requested_at is null
       and current_period_end + coalesce(mc_setting_int('payment_grace_days'), 0) < v_today;$o$);
    if n = d then raise exception 'patch mc_expire_subscriptions nao aplicado'; end if;
    execute n;
  end if;

  -- estado para o site: quantos dias de carência existem ------------------------------------
  d := pg_get_functiondef('public.my_payment_state()'::regprocedure);
  if position('grace_days' in d) = 0 then
    n := replace(d, $o$'current_period_end', (select current_period_end from s))$o$,
                    $o$'current_period_end', (select current_period_end from s), 'grace_days', coalesce(mc_setting_int('payment_grace_days'), 0))$o$);
    if n = d then raise exception 'patch my_payment_state nao aplicado'; end if;
    execute n;
  end if;

  -- reconciliação: renovação dentro da carência soma sobre o fim anterior; recusa dentro da carência não derruba -----
  d := pg_get_functiondef('public.mp_reconcile(text)'::regprocedure);
  if position('payment_grace_days' in d) = 0 then
    n := replace(d, $o$v_base := case when v_sub.current_period_end is null or v_sub.current_period_end < v_today$o$,
                    $o$v_base := case when v_sub.current_period_end is null
                                     or v_sub.current_period_end + coalesce(mc_setting_int('payment_grace_days'), 0) < v_today$o$);
    if n = d then raise exception 'patch mp_reconcile (base) nao aplicado'; end if;
    d := n;
    n := replace(d, $o$      if v_sub.status in ('active','pending','past_due') then
        update subscriptions set status = 'past_due' where id = v_sub.id returning * into v_sub;
      end if;$o$,
                    $o$      if v_sub.status in ('pending','past_due')
         or (v_sub.status = 'active' and not (v_sub.current_period_end is not null
              and v_sub.current_period_end + coalesce(mc_setting_int('payment_grace_days'), 0) >= v_today)) then
        update subscriptions set status = 'past_due' where id = v_sub.id returning * into v_sub;
      end if;$o$);
    if n = d then raise exception 'patch mp_reconcile (recusa) nao aplicado'; end if;
    execute n;
  end if;

  -- pagamento aprovado que vira refunded/charged_back: aceita a transição e aplica o estorno ----
  d := pg_get_functiondef('public.apply_mp_authorized_payment(jsonb)'::regprocedure);
  if position('mp_apply_reversals' in d) = 0 then
    n := replace(d, $o$set status = case when mp_payments.applied and mp_payments.status = 'approved' then mp_payments.status else excluded.status end,
        raw = excluded.raw, updated_at = now()
    where not (mp_payments.applied);$o$,
$o$set status = case when mp_payments.applied and mp_payments.status = 'approved' and excluded.status not in ('refunded','charged_back') then mp_payments.status else excluded.status end,
        raw = excluded.raw, updated_at = now()
    where not (mp_payments.applied) or (mp_payments.status = 'approved' and excluded.status in ('refunded','charged_back'));$o$);
    if n = d then raise exception 'patch apply_mp_authorized_payment (upsert) nao aplicado'; end if;
    d := n;
    n := replace(d, $o$  return mp_reconcile(v_pre);$o$, $o$  perform mp_apply_reversals(v_pre);
  return mp_reconcile(v_pre);$o$);
    if n = d then raise exception 'patch apply_mp_authorized_payment (return) nao aplicado'; end if;
    execute n;
  end if;
end $m$;
