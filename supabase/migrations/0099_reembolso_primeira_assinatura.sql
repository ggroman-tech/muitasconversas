-- ============================================================================
-- 0099 — Reembolso de 7 dias, SÓ na primeira assinatura do cliente.   (NÃO aplicada; testada em rollback)
-- Decisão do Gabriel (25/11 22h11): reembolso integral se o cancelamento for pedido em até 7 dias da PRIMEIRA cobrança aprovada
-- da PRIMEIRA assinatura do cliente. Renovações e reassinaturas depois de cancelar não têm reembolso.
-- Depois de 7 dias: sem reembolso; o acesso segue até o fim do período pago (comportamento atual).
-- Depende da 0098 (mc_release_access e mp_payments.reversed_at). Idempotente.
--
-- Elegível quando TODAS as condições valem (função mc_refund_eligibility):
--   1) o cliente tem assinatura não cancelada, já vinculada ao Mercado Pago;
--   2) nenhuma OUTRA assinatura do cliente teve pagamento (paid/refunded) → é a primeira;
--   3) o cliente nunca teve pagamento estornado/reembolsado;
--   4) existe exatamente 1 pagamento aprovado e aplicado nesta assinatura (a 1ª cobrança; uma renovação já tira a elegibilidade);
--   5) hoje (fuso America/Sao_Paulo) <= data da 1ª cobrança + 7 dias. A data vem de raw.date_created da cobrança (fallback: paid_at).
-- Quem chama: a Edge Function mercadopago-cancel (service_role). O site só LÊ a elegibilidade por my_payment_state
--   (campos refund_eligible e refund_deadline) para mostrar "devolvemos o valor" antes de o cliente cancelar.
-- Registro: mp_payments.refund_requested_at / refund_error; alertas em email_log: refund_done, refund_failed.
-- ============================================================================
alter table public.mp_payments add column if not exists reversed_at timestamptz;          -- (também na 0098)
alter table public.mp_payments add column if not exists refund_requested_at timestamptz;
alter table public.mp_payments add column if not exists refund_error text;

create or replace function public.mc_refund_eligibility(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
declare
  v_sub subscriptions%rowtype; v_pay mp_payments%rowtype; v_n int;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_paid date; v_deadline date;
begin
  select * into v_sub from subscriptions where customer_id = p_customer and status <> 'canceled' limit 1;
  if not found or v_sub.mp_preapproval_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'no_subscription');
  end if;
  if exists (select 1 from subscriptions o join payments p on p.subscription_id = o.id
              where o.customer_id = p_customer and o.id <> v_sub.id and p.status in ('paid','refunded')) then
    return jsonb_build_object('eligible', false, 'reason', 'not_first_subscription');
  end if;
  if exists (select 1 from mp_payments m join mp_preapprovals pr on pr.id = m.preapproval_id
               join subscriptions s on s.id = pr.subscription_id
              where s.customer_id = p_customer and m.reversed_at is not null) then
    return jsonb_build_object('eligible', false, 'reason', 'already_refunded');
  end if;
  select count(*) into v_n from mp_payments m
   where m.preapproval_id = v_sub.mp_preapproval_id and m.status = 'approved' and m.applied;
  if v_n = 0 then return jsonb_build_object('eligible', false, 'reason', 'no_payment'); end if;
  if v_n > 1 then return jsonb_build_object('eligible', false, 'reason', 'renewed'); end if;
  select * into v_pay from mp_payments m
   where m.preapproval_id = v_sub.mp_preapproval_id and m.status = 'approved' and m.applied limit 1;
  v_paid := (coalesce(nullif(v_pay.raw->>'date_created', '')::timestamptz, v_pay.paid_at, now()) at time zone 'America/Sao_Paulo')::date;
  v_deadline := v_paid + 7;
  if v_today > v_deadline then
    return jsonb_build_object('eligible', false, 'reason', 'window_expired', 'deadline', v_deadline);
  end if;
  return jsonb_build_object('eligible', true, 'payment_id', v_pay.id, 'amount_cents', v_pay.amount_cents, 'deadline', v_deadline);
end $f$;
revoke all on function public.mc_refund_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.mc_refund_eligibility(uuid) to service_role;

-- Registra o resultado da tentativa de reembolso feita pela Edge Function (service_role).
--   p_ok = true : encerra o acesso na hora (reembolsado = sem acesso), libera reservas/cópias, marca o pagamento como estornado.
--   p_ok = false: NÃO mexe no acesso (o cancelamento já vale até o fim do período); grava o erro e abre alerta para a equipe.
create or replace function public.mp_record_refund(p_customer uuid, p_payment_id text, p_ok boolean, p_detail text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare
  v_sub subscriptions%rowtype; v_m mp_payments%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_sub from subscriptions where customer_id = p_customer and status <> 'canceled' limit 1 for update;
  select m.* into v_m from mp_payments m join mp_preapprovals pr on pr.id = m.preapproval_id
   join subscriptions s on s.id = pr.subscription_id
   where m.id = p_payment_id and s.customer_id = p_customer for update of m;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  if p_ok then
    if v_m.reversed_at is null then
      update mp_payments set status = 'refunded', reversed_at = now(), refund_requested_at = coalesce(refund_requested_at, now()), refund_error = null
       where id = p_payment_id;
      update payments set status = 'refunded' where mp_payment_id = p_payment_id and status <> 'refunded';
    end if;
    if v_sub.id is not null then
      update subscriptions
         set status = 'canceled', canceled_at = coalesce(canceled_at, now()),
             cancel_requested_at = coalesce(cancel_requested_at, now()), current_period_end = v_today - 1
       where id = v_sub.id;
    end if;
    perform mc_release_access(p_customer);
    insert into email_log(customer_id, kind, dedupe_key, subject)
    values (p_customer, 'refund_done', 'refund:' || p_payment_id, 'Reembolso de 7 dias feito (primeira assinatura)')
    on conflict (dedupe_key) do nothing;
    return jsonb_build_object('result', 'ok', 'status', 'canceled');
  end if;

  update mp_payments set refund_requested_at = now(), refund_error = left(coalesce(p_detail, 'erro desconhecido'), 300) where id = p_payment_id;
  insert into email_log(customer_id, kind, dedupe_key, subject)
  values (p_customer, 'refund_failed', 'refundfail:' || p_payment_id,
          'ATENÇÃO: reembolso de 7 dias NÃO foi feito (pagamento ' || p_payment_id || '). Estornar no painel do Mercado Pago.')
  on conflict (dedupe_key) do nothing;
  return jsonb_build_object('result', 'refund_failed');
end $f$;
revoke all on function public.mp_record_refund(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.mp_record_refund(uuid, text, boolean, text) to service_role;

-- Estado de pagamento para o site: acrescenta carência (0098) e elegibilidade de reembolso.
create or replace function public.my_payment_state()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with s as (select * from subscriptions where customer_id = auth.uid() and status <> 'canceled' limit 1),
  p as (select * from mp_preapprovals where subscription_id in (select id from s) order by updated_at desc limit 1),
  pay as (select * from mp_payments where preapproval_id in (select id from p) order by coalesce(paid_at, updated_at) desc limit 1),
  rf as (select public.mc_refund_eligibility(auth.uid()) as j)
  select jsonb_build_object('mp_linked', exists(select 1 from p), 'mp_status', (select status from p),
    'last_payment_status', (select status from pay), 'last_payment_at', (select coalesce(paid_at, updated_at) from pay),
    'cancel_requested_at', (select cancel_requested_at from s), 'current_period_end', (select current_period_end from s),
    'grace_days', coalesce(public.mc_setting_int('payment_grace_days'), 0),
    'refund_eligible', coalesce((select (j->>'eligible')::boolean from rf), false),
    'refund_deadline', (select j->>'deadline' from rf));
$function$;
