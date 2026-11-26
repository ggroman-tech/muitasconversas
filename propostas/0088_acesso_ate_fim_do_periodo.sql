-- ============================================================================
-- 0088 — APLICADA (cópia em supabase/migrations) (gerada na revisão noturna; testada em rollback)
-- PRIORIDADE 1 (corrige promessa feita ao cliente): quem pediu cancelamento deve
-- continuar reservando/entrando na fila/recebendo oferta ATÉ O FIM DO PERÍODO PAGO.
-- A migration 0086 acrescentou "cancel_requested_at is null" em reserve_book e
-- mc_promote_queue, o que bloqueia tudo logo após o pedido. Esta proposta remove
-- só esse filtro. O encerramento no fim do período já cancela reservas na fila e
-- libera cópias (mc_expire_subscriptions, 0086).
-- Risco: baixo. Teste: cliente com cancel_requested_at reserva livro -> 'offered';
--   período vencido + mc_expire_subscriptions -> 'canceled', reservas abertas = 0,
--   cópia 'held' liberada. (Rodado em rollback: OK.)
-- Ordem: aplicar primeiro.
-- ============================================================================
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.reserve_book(uuid)'::regprocedure);
  n := replace(d, $o$status = 'active' and cancel_requested_at is null and (current_period_end is null$o$, $o$status = 'active' and (current_period_end is null$o$);
  if n = d then raise exception 'patch reserve_book nao aplicado'; end if;
  execute n;

  d := pg_get_functiondef('public.mc_promote_queue(uuid)'::regprocedure);
  n := replace(d, $o$s.status = 'active' and s.cancel_requested_at is null and (s.current_period_end$o$, $o$s.status = 'active' and (s.current_period_end$o$);
  if n = d then raise exception 'patch mc_promote_queue nao aplicado'; end if;
  execute n;
end $m$;
