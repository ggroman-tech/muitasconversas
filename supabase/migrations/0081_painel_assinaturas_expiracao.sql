-- 0081: painel de assinaturas (equipe), vínculo manual com o Mercado Pago e expiração diária. Já aplicada no banco.
create or replace view painel_subscriptions as
select c.id as customer_id, c.full_name, c.email::text as email, c.whatsapp, s.id as subscription_id,
       s.status::text as status, s.started_at, s.current_period_end,
       (s.current_period_end - (now() at time zone 'America/Sao_Paulo')::date) as days_left,
       s.mp_preapproval_id, mp.status as mp_status, s.payment_method, c.created_at,
       lp.paid_at as last_paid_at, lp.amount_cents as last_amount_cents,
       coalesce(pc.paid_count, 0)::int as paid_count
from subscriptions s
join customers c on c.id = s.customer_id
left join mp_preapprovals mp on mp.id = s.mp_preapproval_id
left join lateral (select paid_at, amount_cents from payments where subscription_id = s.id and status = 'paid' order by paid_at desc nulls last limit 1) lp on true
left join lateral (select count(*) as paid_count from payments where subscription_id = s.id and status = 'paid') pc on true
where mc_is_staff('admin'::staff_role, 'ops'::staff_role);

create or replace view painel_mp_unlinked as
select id, status, payer_email, updated_at
from mp_preapprovals
where subscription_id is null and mc_is_staff('admin'::staff_role, 'ops'::staff_role);

revoke all on painel_subscriptions, painel_mp_unlinked from public, anon;
grant select on painel_subscriptions, painel_mp_unlinked to authenticated, service_role;

create or replace function staff_link_mp_preapproval(p_preapproval_id text, p_customer_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub subscriptions%rowtype; v_pre mp_preapprovals%rowtype;
begin
  if not mc_is_staff('admin'::staff_role, 'ops'::staff_role) then
    raise exception 'forbidden' using errcode = 'P0001', detail = 'forbidden';
  end if;
  select * into v_pre from mp_preapprovals where id = p_preapproval_id for update;
  if not found then return jsonb_build_object('result','unknown_preapproval'); end if;
  if v_pre.subscription_id is not null then return jsonb_build_object('result','already_linked'); end if;
  select * into v_sub from subscriptions where customer_id = p_customer_id and status <> 'canceled' for update;
  if not found then return jsonb_build_object('result','no_subscription'); end if;
  if v_sub.mp_preapproval_id is not null then return jsonb_build_object('result','customer_already_linked'); end if;
  update subscriptions set mp_preapproval_id = p_preapproval_id where id = v_sub.id;
  update mp_preapprovals set subscription_id = v_sub.id where id = p_preapproval_id;
  return mp_reconcile(p_preapproval_id);
end $$;
revoke all on function staff_link_mp_preapproval(text, uuid) from public, anon;
grant execute on function staff_link_mp_preapproval(text, uuid) to authenticated;

create or replace function mc_expire_subscriptions()
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update subscriptions set status = 'past_due'
   where status = 'active' and current_period_end < (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function mc_expire_subscriptions() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function mc_expire_subscriptions() to service_role;
  end if;
end $$;

-- Agenda diária (03h de Brasília = 06h UTC) via pg_cron.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'mc-expire-subscriptions';
  perform cron.schedule('mc-expire-subscriptions', '0 6 * * *', 'select public.mc_expire_subscriptions()');
exception when others then
  raise notice 'pg_cron não habilitado: %', sqlerrm;
end $$;
