-- Link do checkout do plano (não é segredo). O id do plano fica em settings.mp_plan_id.
create or replace function mp_checkout_url()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=' || (s.value #>> '{}')
  from settings s where s.key = 'mp_plan_id' and nullif(s.value #>> '{}', '') is not null
$$;
revoke all on function mp_checkout_url() from public, anon;
grant execute on function mp_checkout_url() to authenticated;
