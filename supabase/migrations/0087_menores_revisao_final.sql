-- Itens menores da revisão final. Já aplicada no banco.
do $m$
declare d text; n text;
begin
  -- dados antigos não sobrescrevem o estado mais novo do Mercado Pago
  d := pg_get_functiondef('public.apply_mp_preapproval(jsonb)'::regprocedure);
  n := replace(d, $o$raw = excluded.raw, updated_at = now();$o$,
$o$raw = excluded.raw, updated_at = now()
    where coalesce((excluded.raw->>'last_modified')::timestamptz, 'epoch'::timestamptz)
       >= coalesce((mp_preapprovals.raw->>'last_modified')::timestamptz, 'epoch'::timestamptz);$o$);
  if n = d then raise exception 'patch apply_mp_preapproval nao aplicado'; end if;
  execute n;

  -- confirmação manual da equipe = reativação de propósito: limpa o pedido de cancelamento (se o MP não estiver cancelado)
  d := pg_get_functiondef('public.mp_confirm_payment_internal(text,text,integer,timestamptz,text,uuid)'::regprocedure);
  n := replace(d, $o$  return mp_reconcile(p_preapproval_id);$o$,
$o$  v_res := mp_reconcile(p_preapproval_id);
  update subscriptions set cancel_requested_at = null
   where mp_preapproval_id = p_preapproval_id and status <> 'canceled'
     and not exists (select 1 from mp_preapprovals where id = p_preapproval_id and status = 'cancelled');
  return v_res;$o$);
  n := replace(n, 'v_plan text;', 'v_plan text; v_res jsonb;');
  if n = d or position('v_res jsonb' in n) = 0 then raise exception 'patch confirm nao aplicado'; end if;
  execute n;
end $m$;
-- Não aplicado (pendente de autorização): job diário que apaga mp_webhook_log/mp_sync_log com mais de 30 dias.
