-- Fechamento de pedidos e cancelamentos: sexta-feira 08h (25h antes da janela das 09h de sábado).
update settings set value = '25', updated_at = now() where key = 'saturday_cutoff_hours_before';

-- Sábados já gerados e ainda abertos passam a fechar na sexta 08h.
update delivery_days
   set cutoff_at = ((day + ((mc_setting('saturday_start') #>> '{}')::time)) at time zone 'America/Sao_Paulo') - interval '25 hours'
 where status = 'open';

-- Assinatura de 30 dias: cada pagamento estende o período em 30 dias (antes: 1 mês).
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'apply_pagarme_event' and p.prokind = 'f';
  if d is null then raise exception 'apply_pagarme_event não encontrada'; end if;
  execute replace(d, 'interval ''1 month''', 'interval ''30 days''');
end $$;
