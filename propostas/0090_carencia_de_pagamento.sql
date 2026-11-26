-- ============================================================================
-- PROPOSTA 0090 — NÃO APLICADA (testada em rollback, em cima da 0088)
-- O que faz: carência de N dias (settings.payment_grace_days, padrão 3) antes de
-- marcar past_due quando a renovação atrasa (cartão recusado costuma ser
-- reprocessado pelo MP em 1-3 dias). Durante a carência o cliente continua
-- reservando/agendando. Cancelamento pedido NÃO tem carência (data exata do fim).
-- Risco: baixo. Para desligar: update settings set value='0' where key='payment_grace_days'.
-- Depende da 0088. Front: lib/assinatura/state.ts deve tratar active+period_end vencido
-- dentro da carência como "ativo" (hoje o cron roda 06:00 UTC e muda para past_due).
-- ============================================================================
insert into settings(key, value) values ('payment_grace_days', '3'::jsonb) on conflict (key) do nothing;

create or replace function public.mc_period_ok(p_end date, p_cancel timestamptz)
returns boolean language sql stable set search_path to 'public','pg_temp' as $f$
  select p_end is null
      or p_end + (case when p_cancel is null then coalesce(mc_setting_int('payment_grace_days'), 0) else 0 end)
         >= (now() at time zone 'America/Sao_Paulo')::date;
$f$;

do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.reserve_book(uuid)'::regprocedure);
  n := replace(d, $o$status = 'active' and (current_period_end is null or current_period_end >= (now() at time zone 'America/Sao_Paulo')::date)$o$,
                  $o$status = 'active' and mc_period_ok(current_period_end, cancel_requested_at)$o$);
  if n = d then raise exception 'patch reserve_book nao aplicado (aplicar 0088 antes)'; end if;
  execute n;

  d := pg_get_functiondef('public.mc_promote_queue(uuid)'::regprocedure);
  n := replace(d, $o$s.status = 'active' and (s.current_period_end is null or s.current_period_end >= (now() at time zone 'America/Sao_Paulo')::date)$o$,
                  $o$s.status = 'active' and mc_period_ok(s.current_period_end, s.cancel_requested_at)$o$);
  if n = d then raise exception 'patch mc_promote_queue nao aplicado (aplicar 0088 antes)'; end if;
  execute n;

  d := pg_get_functiondef('public.mc_expire_subscriptions()'::regprocedure);
  n := replace(d, $o$where status = 'active' and cancel_requested_at is null and current_period_end < v_today;$o$,
                  $o$where status = 'active' and cancel_requested_at is null
       and current_period_end + coalesce(mc_setting_int('payment_grace_days'), 0) < v_today;$o$);
  if n = d then raise exception 'patch mc_expire_subscriptions nao aplicado'; end if;
  execute n;

  d := pg_get_functiondef('public.my_payment_state()'::regprocedure);
  n := replace(d, $o$'current_period_end', (select current_period_end from s))$o$,
                  $o$'current_period_end', (select current_period_end from s), 'grace_days', coalesce(mc_setting_int('payment_grace_days'), 0))$o$);
  if n = d then raise exception 'patch my_payment_state nao aplicado'; end if;
  execute n;
end $m$;
