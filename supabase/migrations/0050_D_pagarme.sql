-- Frente D: aplica eventos do webhook Pagar.me. Chamada só pela Edge Function (service_role).
-- Mapeamento assumido (ver docs/pagarme-integracao.md): payments.pagarme_transaction_id = data.id (charge, "ch_...").
create or replace function apply_pagarme_event(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type      text := event->>'type';
  v_data      jsonb := coalesce(event->'data', '{}'::jsonb);
  v_tx        text;
  v_sub_ext   text;
  v_cust_ext  text;
  v_sub       subscriptions%rowtype;
  v_pay       payments%rowtype;
  v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_base      date;
  v_amount    int;
  v_paid_at   timestamptz;
  v_rows      int;
begin
  if v_type is null then
    return jsonb_build_object('result','ignored','reason','missing_type');
  end if;

  -- ids externos (charge/subscription/customer) em formatos alternativos do payload v5
  v_sub_ext := coalesce(v_data->'subscription'->>'id', v_data->'invoice'->>'subscription_id',
                        case when v_type like 'subscription.%' then v_data->>'id' end);
  v_cust_ext := v_data->'customer'->>'id';

  if v_type = 'subscription.canceled' then
    if v_sub_ext is null then
      return jsonb_build_object('result','ignored','reason','missing_subscription_id');
    end if;
    select * into v_sub from subscriptions where pagarme_subscription_id = v_sub_ext for update;
    if not found then
      return jsonb_build_object('result','ignored','reason','unknown_subscription');
    end if;
    if v_sub.status = 'canceled' then
      return jsonb_build_object('result','duplicate','subscription_id',v_sub.id);
    end if;
    update subscriptions set status = 'canceled', canceled_at = now() where id = v_sub.id;
    return jsonb_build_object('result','applied','event',v_type,'subscription_id',v_sub.id);
  end if;

  if v_type not in ('charge.paid','charge.payment_failed') then
    return jsonb_build_object('result','ignored','reason','unhandled_type','type',v_type);
  end if;

  v_tx := v_data->>'id';
  if v_tx is null then
    return jsonb_build_object('result','ignored','reason','missing_charge_id');
  end if;

  -- serializa entregas concorrentes do mesmo charge
  perform pg_advisory_xact_lock(hashtextextended('pagarme:' || v_tx, 0));

  -- localiza assinatura: pelo id externo, senão pelo customer externo (assinatura não cancelada)
  if v_sub_ext is not null then
    select * into v_sub from subscriptions where pagarme_subscription_id = v_sub_ext for update;
  end if;
  if v_sub.id is null and v_cust_ext is not null then
    select s.* into v_sub from subscriptions s join customers c on c.id = s.customer_id
     where c.pagarme_customer_id = v_cust_ext and s.status <> 'canceled' for update of s;
  end if;

  select * into v_pay from payments where pagarme_transaction_id = v_tx for update;

  if v_pay.id is null and v_sub.id is null then
    return jsonb_build_object('result','ignored','reason','unknown_subscription','charge',v_tx);
  end if;

  v_amount  := coalesce((v_data->>'amount')::int, (v_data->>'paid_amount')::int,
                        (select (value #>> '{}')::int from settings where key = 'plan_price_cents'));
  v_paid_at := coalesce((v_data->'last_transaction'->>'paid_at')::timestamptz,
                        (v_data->>'paid_at')::timestamptz, now());

  if v_type = 'charge.paid' then
    if v_pay.id is not null and v_pay.status = 'paid' then
      return jsonb_build_object('result','duplicate','payment_id',v_pay.id);
    end if;

    if v_pay.id is null then
      insert into payments(customer_id, subscription_id, amount_cents, status, pagarme_transaction_id,
                           payment_method, due_at, paid_at)
      values (v_sub.customer_id, v_sub.id, v_amount, 'paid', v_tx,
              coalesce(v_data->>'payment_method','pix'), v_today, v_paid_at)
      returning * into v_pay;
    else
      update payments set status = 'paid', paid_at = v_paid_at where id = v_pay.id returning * into v_pay;
    end if;

    -- assinatura vinda do pagamento já existente, se o evento não a identificou
    if v_sub.id is null then
      select * into v_sub from subscriptions where id = v_pay.subscription_id for update;
    end if;

    if v_sub.id is not null and v_sub.status <> 'canceled' then
      v_base := case when v_sub.current_period_end is null or v_sub.current_period_end < v_today
                     then v_today else v_sub.current_period_end end;
      update subscriptions
         set status = 'active',
             started_at = coalesce(started_at, v_paid_at),
             current_period_end = (v_base + interval '1 month')::date
       where id = v_sub.id;
    end if;
    return jsonb_build_object('result','applied','event',v_type,'payment_id',v_pay.id,'subscription_id',v_sub.id);
  end if;

  -- charge.payment_failed
  if v_pay.id is not null and v_pay.status = 'paid' then
    return jsonb_build_object('result','ignored','reason','already_paid','payment_id',v_pay.id);
  end if;

  if v_pay.id is null then
    insert into payments(customer_id, subscription_id, amount_cents, status, pagarme_transaction_id,
                         payment_method, due_at)
    values (v_sub.customer_id, v_sub.id, v_amount, 'failed', v_tx,
            coalesce(v_data->>'payment_method','pix'), v_today)
    returning * into v_pay;
  elsif v_pay.status <> 'failed' then
    update payments set status = 'failed' where id = v_pay.id returning * into v_pay;
  end if;

  if v_sub.id is null then
    select * into v_sub from subscriptions where id = v_pay.subscription_id for update;
  end if;
  if v_sub.id is not null and v_sub.status in ('active','pending','past_due') then
    update subscriptions set status = 'past_due' where id = v_sub.id;
  end if;

  insert into email_log(customer_id, kind, dedupe_key, subject)
  values (v_pay.customer_id, 'payment_failed', 'payment_failed:' || v_tx, 'Falha no pagamento da assinatura')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('result', case when v_rows = 0 then 'duplicate' else 'applied' end,
                            'event',v_type,'payment_id',v_pay.id,'subscription_id',v_sub.id);
end;
$$;

revoke all on function apply_pagarme_event(jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function apply_pagarme_event(jsonb) to service_role;
  end if;
end $$;
