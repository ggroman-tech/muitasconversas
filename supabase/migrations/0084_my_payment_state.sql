-- Estado do pagamento do cliente logado (usado em /assinar/concluir e /conta).
create or replace function public.my_payment_state() returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select id from subscriptions where customer_id = auth.uid() and status <> 'canceled' limit 1),
  p as (select * from mp_preapprovals where subscription_id in (select id from s) order by updated_at desc limit 1),
  pay as (select * from mp_payments where preapproval_id in (select id from p) order by coalesce(paid_at, updated_at) desc limit 1)
  select jsonb_build_object('mp_linked', exists(select 1 from p), 'mp_status', (select status from p), 'last_payment_status', (select status from pay), 'last_payment_at', (select coalesce(paid_at, updated_at) from pay));
$$;
revoke all on function public.my_payment_state() from public, anon;
grant execute on function public.my_payment_state() to authenticated;
