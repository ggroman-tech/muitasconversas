-- PROPOSTA 0093 — NÃO APLICADA (testada em rollback). PRECISA DE AUTORIZAÇÃO DO GABRIEL
-- para agendar o cron (apaga dados). A função sozinha é inofensiva: só roda se chamada.
-- Mantém 30 dias de mp_webhook_log e mp_sync_log (o sync roda a cada 5 min = ~8.600
-- linhas/mês; sem limpeza cresce para sempre). Não toca em mp_payments/email_log/pagamentos.
create or replace function public.mc_purge_mp_logs(p_days int default 30) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare a int; b int;
begin
  if p_days < 7 then raise exception 'p_days minimo 7'; end if;
  delete from mp_webhook_log where received_at < now() - make_interval(days => p_days); get diagnostics a = row_count;
  delete from mp_sync_log where started_at < now() - make_interval(days => p_days); get diagnostics b = row_count;
  return jsonb_build_object('webhook_deleted', a, 'sync_deleted', b);
end $f$;
revoke all on function public.mc_purge_mp_logs(int) from public, anon, authenticated;
-- SOMENTE APÓS AUTORIZAÇÃO (não executar sem o ok do Gabriel):
-- select cron.schedule('mc-purge-mp-logs', '30 7 * * *', $$select public.mc_purge_mp_logs(30)$$);
