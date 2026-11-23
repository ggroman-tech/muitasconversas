-- 0083: Mercado Pago — consulta periódica (sync), logs de depuração, confirmação manual e saúde da integração.
-- Objetivo: o site identifica quem pagou SEM depender só do webhook nem da URL de retorno.

create extension if not exists pg_net with schema extensions;

-- Logs (somente service role / funções security definer; RLS ligada e sem políticas).
create table if not exists mp_webhook_log (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  topic text, data_id text, sig_ok boolean, http_status int, outcome text, detail text,
  has_signature boolean, has_request_id boolean
);
create table if not exists mp_sync_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean, error text,
  preapprovals int default 0, payments int default 0, unlinked int default 0,
  detail jsonb
);
alter table mp_webhook_log enable row level security;
alter table mp_sync_log enable row level security;
revoke all on mp_webhook_log, mp_sync_log from anon, authenticated;
revoke all on sequence mp_webhook_log_id_seq, mp_sync_log_id_seq from anon, authenticated;

-- Segredo próprio do sync (guardado no Vault; o valor nunca vai para o repositório).
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'mc_sync_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'mc_sync_secret', 'Autentica pg_cron -> edge function mercadopago-sync');
  end if;
end $$;

create or replace function mc_sync_secret_ok(p text) returns boolean
language sql security definer set search_path = public, pg_temp stable as $$
  select coalesce(p, '') <> '' and exists (select 1 from vault.decrypted_secrets where name = 'mc_sync_secret' and decrypted_secret = p);
$$;
revoke all on function mc_sync_secret_ok(text) from public, anon, authenticated;
grant execute on function mc_sync_secret_ok(text) to service_role;

-- Confirmação manual (interna: só postgres/service_role). Idempotente pelo id real do pagamento do MP.
create or replace function mp_confirm_payment_internal(
  p_preapproval_id text, p_payment_id text, p_amount_cents int,
  p_paid_at timestamptz default now(), p_payer_email text default null, p_customer_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub subscriptions%rowtype; v_plan text;
begin
  select trim(both '"' from value::text) into v_plan from settings where key = 'mp_plan_id';
  insert into mp_preapprovals(id, status, payer_email, plan_id)
  values (p_preapproval_id, 'authorized', nullif(lower(btrim(coalesce(p_payer_email,''))),''), v_plan)
  on conflict (id) do update
    set payer_email = coalesce(mp_preapprovals.payer_email, excluded.payer_email), updated_at = now();
  if p_customer_id is not null and not exists (select 1 from mp_preapprovals where id = p_preapproval_id and subscription_id is not null) then
    select * into v_sub from subscriptions
     where customer_id = p_customer_id and status <> 'canceled' and mp_preapproval_id is null for update;
    if found then
      update subscriptions set mp_preapproval_id = p_preapproval_id where id = v_sub.id;
      update mp_preapprovals set subscription_id = v_sub.id where id = p_preapproval_id;
    end if;
  end if;
  insert into mp_payments(id, preapproval_id, status, amount_cents, paid_at, raw)
  values (p_payment_id, p_preapproval_id, 'approved', p_amount_cents, p_paid_at, jsonb_build_object('manual', true))
  on conflict (id) do update set status = 'approved', amount_cents = excluded.amount_cents, paid_at = excluded.paid_at, updated_at = now()
    where not mp_payments.applied;
  return mp_reconcile(p_preapproval_id);
end $$;
revoke all on function mp_confirm_payment_internal(text,text,int,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function mp_confirm_payment_internal(text,text,int,timestamptz,text,uuid) to service_role;

-- Versão para o painel (admin/ops).
create or replace function staff_mp_confirm_payment(
  p_preapproval_id text, p_payment_id text, p_amount_cents int,
  p_paid_at timestamptz default now(), p_customer_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not mc_is_staff('admin'::staff_role, 'ops'::staff_role) then
    raise exception 'forbidden' using errcode = 'P0001', detail = 'forbidden';
  end if;
  return mp_confirm_payment_internal(p_preapproval_id, p_payment_id, p_amount_cents, p_paid_at, null, p_customer_id);
end $$;
revoke all on function staff_mp_confirm_payment(text,text,int,timestamptz,uuid) from public, anon;
grant execute on function staff_mp_confirm_payment(text,text,int,timestamptz,uuid) to authenticated;

-- Saúde da integração (painel).
create or replace function staff_mp_health() returns jsonb language plpgsql security definer set search_path = public, pg_temp stable as $$
declare r jsonb;
begin
  if not mc_is_staff('admin'::staff_role, 'ops'::staff_role) then
    raise exception 'forbidden' using errcode = 'P0001', detail = 'forbidden';
  end if;
  select jsonb_build_object(
    'last_sync', (select to_jsonb(s) - 'detail' from mp_sync_log s order by id desc limit 1),
    'last_webhook', (select to_jsonb(w) from mp_webhook_log w order by id desc limit 1),
    'webhooks_24h', (select count(*) from mp_webhook_log where received_at > now() - interval '24 hours'),
    'preapprovals', (select count(*) from mp_preapprovals),
    'unlinked', (select count(*) from mp_preapprovals where subscription_id is null),
    'payments', (select count(*) from mp_payments)
  ) into r;
  return r;
end $$;
revoke all on function staff_mp_health() from public, anon;
grant execute on function staff_mp_health() to authenticated;

-- Agenda: a cada 5 minutos chama a edge function mercadopago-sync.
select cron.schedule('mc-mp-sync', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://fzkdhtutpgydywpzapyc.supabase.co/functions/v1/mercadopago-sync',
    headers := jsonb_build_object('content-type','application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mc_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
$job$);
