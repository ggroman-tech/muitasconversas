-- Cancelar no site => cancela no Mercado Pago; acesso segue até o fim do período pago.
alter table public.subscriptions add column if not exists cancel_requested_at timestamptz;

-- mp_reconcile: MP 'cancelled' com período pago em dia NÃO derruba o acesso na hora.
do $m$
declare d text; n text;
  o text := $o$  if v_pre.status = 'cancelled' and v_sub.status <> 'canceled' then
    update subscriptions set status = 'canceled', canceled_at = now() where id = v_sub.id returning * into v_sub;
  elsif$o$;
  w text := $o$  if v_pre.status = 'cancelled' and v_sub.status <> 'canceled' then
    if v_sub.status = 'active' and v_sub.current_period_end is not null and v_sub.current_period_end >= v_today then
      -- cancelamento pedido: a cobrança parou, mas o acesso vai até o fim do período já pago
      update subscriptions set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = v_sub.id returning * into v_sub;
    else
      update subscriptions set status = 'canceled', canceled_at = now(), cancel_requested_at = coalesce(cancel_requested_at, now()) where id = v_sub.id returning * into v_sub;
    end if;
  elsif$o$;
begin
  d := pg_get_functiondef('public.mp_reconcile(text)'::regprocedure);
  n := replace(d, o, w);
  if n = d then raise exception 'patch de mp_reconcile nao aplicado'; end if;
  execute n;
end $m$;

create or replace function public.mc_expire_subscriptions() returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare n1 int; n2 int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- cancelamento pedido e período pago terminou: encerra de vez
  update subscriptions set status = 'canceled', canceled_at = now()
   where status = 'active' and cancel_requested_at is not null and current_period_end < v_today;
  get diagnostics n1 = row_count;
  update subscriptions set status = 'past_due'
   where status = 'active' and cancel_requested_at is null and current_period_end < v_today;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $f$;

create or replace function public.my_payment_state() returns jsonb language sql stable security definer set search_path = public as $f$
  with s as (select * from subscriptions where customer_id = auth.uid() and status <> 'canceled' limit 1),
  p as (select * from mp_preapprovals where subscription_id in (select id from s) order by updated_at desc limit 1),
  pay as (select * from mp_payments where preapproval_id in (select id from p) order by coalesce(paid_at, updated_at) desc limit 1)
  select jsonb_build_object('mp_linked', exists(select 1 from p), 'mp_status', (select status from p),
    'last_payment_status', (select status from pay), 'last_payment_at', (select coalesce(paid_at, updated_at) from pay),
    'cancel_requested_at', (select cancel_requested_at from s), 'current_period_end', (select current_period_end from s));
$f$;
revoke all on function public.my_payment_state() from public, anon;
grant execute on function public.my_payment_state() to authenticated;
