-- 0078: assinaturas Mercado Pago (plano associado, link de checkout). Já aplicada no banco.
-- Fluxo: cadastro -> /assinar/concluir (link do plano) -> pagamento no MP -> webhook (Edge Function mercadopago-webhook)
-- grava mp_preapprovals/mp_payments -> mp_reconcile vincula à assinatura (por external_reference, e-mail ou claim no retorno)
-- e libera o acesso (status active, +30 dias por cobrança aprovada). Id do plano em settings.mp_plan_id.
alter table subscriptions add column if not exists mp_preapproval_id text unique;
alter table payments add column if not exists mp_payment_id text unique;

create table if not exists mp_preapprovals (
  id text primary key, status text, payer_email text, plan_id text, external_reference text,
  subscription_id uuid references subscriptions(id), raw jsonb, updated_at timestamptz not null default now()
);
create table if not exists mp_payments (
  id text primary key, preapproval_id text not null, status text, amount_cents int, paid_at timestamptz,
  payment_method text, applied boolean not null default false, raw jsonb, updated_at timestamptz not null default now()
);
create index if not exists mp_payments_pre_idx on mp_payments(preapproval_id);
alter table mp_preapprovals enable row level security;
alter table mp_payments enable row level security;

create or replace function mp_reconcile(p_pre text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pre mp_preapprovals%rowtype; v_sub subscriptions%rowtype; v_pay mp_payments%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_base date; v_applied int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('mp:' || p_pre, 0));
  select * into v_pre from mp_preapprovals where id = p_pre;
  if not found then return jsonb_build_object('result','unknown_preapproval'); end if;

  if v_pre.subscription_id is not null then
    select * into v_sub from subscriptions where id = v_pre.subscription_id for update;
  else
    if v_pre.external_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_sub from subscriptions
       where id = v_pre.external_reference::uuid and status <> 'canceled' and mp_preapproval_id is null for update;
    end if;
    if v_sub.id is null and v_pre.payer_email is not null then
      select s.* into v_sub from subscriptions s join customers c on c.id = s.customer_id
       where c.email = lower(btrim(v_pre.payer_email))::citext and s.status <> 'canceled'
         and s.mp_preapproval_id is null
       order by s.id limit 1 for update of s;
    end if;
    if v_sub.id is not null then
      update subscriptions set mp_preapproval_id = p_pre where id = v_sub.id;
      update mp_preapprovals set subscription_id = v_sub.id where id = p_pre;
    end if;
  end if;
  if v_sub.id is null then return jsonb_build_object('result','unlinked','preapproval',p_pre); end if;

  for v_pay in select * from mp_payments where preapproval_id = p_pre and not applied order by paid_at nulls last, id loop
    if v_pay.status = 'approved' then
      insert into payments(customer_id, subscription_id, amount_cents, status, mp_payment_id, payment_method, due_at, paid_at)
      values (v_sub.customer_id, v_sub.id, coalesce(v_pay.amount_cents, 0), 'paid', v_pay.id,
              coalesce(v_pay.payment_method, 'credit_card'), v_today, coalesce(v_pay.paid_at, now()))
      on conflict (mp_payment_id) do nothing;
      if v_sub.status <> 'canceled' then
        v_base := case when v_sub.current_period_end is null or v_sub.current_period_end < v_today
                       then v_today else v_sub.current_period_end end;
        update subscriptions
           set status = 'active', started_at = coalesce(started_at, coalesce(v_pay.paid_at, now())),
               current_period_end = v_base + 30, payment_method = coalesce(v_pay.payment_method, payment_method)
         where id = v_sub.id returning * into v_sub;
      end if;
      update mp_payments set applied = true where id = v_pay.id;
      v_applied := v_applied + 1;
    elsif v_pay.status in ('rejected','cancelled') then
      insert into payments(customer_id, subscription_id, amount_cents, status, mp_payment_id, payment_method, due_at)
      values (v_sub.customer_id, v_sub.id, coalesce(v_pay.amount_cents, 0), 'failed', v_pay.id,
              coalesce(v_pay.payment_method, 'credit_card'), v_today)
      on conflict (mp_payment_id) do nothing;
      if v_sub.status in ('active','pending','past_due') then
        update subscriptions set status = 'past_due' where id = v_sub.id returning * into v_sub;
      end if;
      insert into email_log(customer_id, kind, dedupe_key, subject)
      values (v_sub.customer_id, 'payment_failed', 'payment_failed:mp:' || v_pay.id, 'Falha no pagamento da assinatura')
      on conflict (dedupe_key) do nothing;
      update mp_payments set applied = true where id = v_pay.id;
      v_applied := v_applied + 1;
    end if;
  end loop;

  if v_pre.status = 'cancelled' and v_sub.status <> 'canceled' then
    update subscriptions set status = 'canceled', canceled_at = now() where id = v_sub.id returning * into v_sub;
  elsif v_pre.status = 'paused' and v_sub.status = 'active' then
    update subscriptions set status = 'past_due' where id = v_sub.id returning * into v_sub;
  end if;

  return jsonb_build_object('result','ok','subscription_id',v_sub.id,'status',v_sub.status,'payments_applied',v_applied);
end $$;

create or replace function apply_mp_preapproval(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text := p->>'id';
begin
  if v_id is null then return jsonb_build_object('result','ignored','reason','missing_id'); end if;
  insert into mp_preapprovals(id, status, payer_email, plan_id, external_reference, raw)
  values (v_id, p->>'status', nullif(lower(btrim(coalesce(p->>'payer_email',''))),''),
          p->>'preapproval_plan_id', nullif(p->>'external_reference',''), p)
  on conflict (id) do update
    set status = excluded.status,
        payer_email = coalesce(excluded.payer_email, mp_preapprovals.payer_email),
        plan_id = coalesce(excluded.plan_id, mp_preapprovals.plan_id),
        external_reference = coalesce(excluded.external_reference, mp_preapprovals.external_reference),
        raw = excluded.raw, updated_at = now();
  return mp_reconcile(v_id);
end $$;

create or replace function apply_mp_authorized_payment(ap jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pre text := coalesce(ap->>'preapproval_id', ap->'payment'->>'preapproval_id');
  v_id text := coalesce(ap->'payment'->>'id', 'ap:' || (ap->>'id'));
  v_status text;
begin
  if v_pre is null or ap->>'id' is null then return jsonb_build_object('result','ignored','reason','missing_ids'); end if;
  if not exists (select 1 from mp_preapprovals where id = v_pre) then
    return jsonb_build_object('result','ignored','reason','unknown_preapproval','preapproval',v_pre);
  end if;
  v_status := coalesce(ap->'payment'->>'status',
                       case ap->>'status' when 'processed' then 'approved' when 'cancelled' then 'cancelled' else ap->>'status' end);
  insert into mp_payments(id, preapproval_id, status, amount_cents, paid_at, payment_method, raw)
  values (v_id, v_pre, v_status,
          round(coalesce((ap->>'transaction_amount')::numeric, 0) * 100)::int,
          coalesce((ap->>'last_modified')::timestamptz, (ap->>'date_created')::timestamptz),
          coalesce(ap->'payment'->>'payment_type_id', 'credit_card'), ap)
  on conflict (id) do update
    set status = case when mp_payments.applied and mp_payments.status = 'approved' then mp_payments.status else excluded.status end,
        raw = excluded.raw, updated_at = now()
    where not (mp_payments.applied);
  return mp_reconcile(v_pre);
end $$;

-- Vincula ao cliente logado uma assinatura do MP (retorno do checkout), mesmo se o e-mail do MP for outro.
create or replace function claim_mp_preapproval(p_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_sub subscriptions%rowtype; v_pre mp_preapprovals%rowtype; v_plan text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{8,64}$' then return jsonb_build_object('result','invalid'); end if;
  select * into v_sub from subscriptions where customer_id = v_uid and status <> 'canceled' for update;
  if not found then return jsonb_build_object('result','no_subscription'); end if;
  if v_sub.mp_preapproval_id is not null then
    return jsonb_build_object('result', case when v_sub.mp_preapproval_id = p_id then 'already_linked' else 'other_linked' end,
                              'status', v_sub.status);
  end if;
  select * into v_pre from mp_preapprovals where id = p_id for update;
  if not found then return jsonb_build_object('result','waiting_confirmation'); end if;
  select s.value #>> '{}' into v_plan from settings s where s.key = 'mp_plan_id';
  if v_plan is not null and v_pre.plan_id is distinct from v_plan then return jsonb_build_object('result','invalid'); end if;
  if v_pre.subscription_id is not null and v_pre.subscription_id <> v_sub.id then
    return jsonb_build_object('result','taken');
  end if;
  update subscriptions set mp_preapproval_id = p_id where id = v_sub.id;
  update mp_preapprovals set subscription_id = v_sub.id where id = p_id;
  return mp_reconcile(p_id);
end $$;

revoke all on function mp_reconcile(text), apply_mp_preapproval(jsonb), apply_mp_authorized_payment(jsonb), claim_mp_preapproval(text) from public, anon, authenticated;
grant execute on function claim_mp_preapproval(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function apply_mp_preapproval(jsonb), apply_mp_authorized_payment(jsonb), mp_reconcile(text) to service_role;
  end if;
end $$;
