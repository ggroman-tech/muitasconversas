-- ============================================================================
-- PROPOSTA 0091 — NÃO APLICADA (testada em rollback)
-- Problema: pagamento já aplicado (approved) que depois vira refunded/charged_back
-- no MP é ignorado (cláusula "where not applied") -> cliente estornado continua com
-- acesso. O que faz: aceita a transição approved -> refunded|charged_back, retira
-- 30 dias de current_period_end (1 ciclo), passa a past_due se o período ficou no
-- passado, registra alerta 'payment_reversed' (precisa da 0089) e marca reversed_at
-- (idempotente). Reembolso parcial também é tratado como estorno do ciclo; a equipe
-- decide no alerta. Risco: baixo-médio. Ordem: depois da 0089.
-- Teste (rodado): approved aplicado -> refunded: período -30d, 1 alerta, 2ª chamada
-- não subtrai de novo.
-- ============================================================================
alter table public.mp_payments add column if not exists reversed_at timestamptz;

create or replace function public.mp_apply_reversals(p_pre text)
returns int language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare r record; v_sub subscriptions%rowtype; n int := 0;
begin
  select s.* into v_sub from subscriptions s join mp_preapprovals p on p.subscription_id = s.id where p.id = p_pre;
  if not found then return 0; end if;
  for r in select * from mp_payments where preapproval_id = p_pre and status in ('refunded','charged_back') and applied and reversed_at is null for update loop
    update subscriptions
       set current_period_end = case when current_period_end is null then null else current_period_end - 30 end,
           status = case when status = 'active' and current_period_end is not null
                          and current_period_end - 30 < (now() at time zone 'America/Sao_Paulo')::date then 'past_due' else status end
     where id = v_sub.id;
    update mp_payments set reversed_at = now() where id = r.id;
    perform mc_staff_alert('payment_reversed', v_sub.customer_id, r.id,
      'Pagamento ' || r.id || ' ficou como ' || r.status || ' no Mercado Pago. Foi removido 1 ciclo (30 dias) do acesso. Conferir o caso.', 'rev:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function public.mp_apply_reversals(text) from public, anon, authenticated;

do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.apply_mp_authorized_payment(jsonb)'::regprocedure);
  n := replace(d, $o$set status = case when mp_payments.applied and mp_payments.status = 'approved' then mp_payments.status else excluded.status end,
        raw = excluded.raw, updated_at = now()
    where not (mp_payments.applied);$o$,
$o$set status = case when mp_payments.applied and mp_payments.status = 'approved' and excluded.status not in ('refunded','charged_back') then mp_payments.status else excluded.status end,
        raw = excluded.raw, updated_at = now()
    where not (mp_payments.applied) or (mp_payments.status = 'approved' and excluded.status in ('refunded','charged_back'));$o$);
  n := replace(n, $o$  return mp_reconcile(v_pre);$o$, $o$  perform mp_apply_reversals(v_pre);
  return mp_reconcile(v_pre);$o$);
  if n = d or position('mp_apply_reversals' in n) = 0 or position('charged_back' in n) = 0 then raise exception 'patch apply_mp_authorized_payment nao aplicado'; end if;
  execute n;
end $m$;
