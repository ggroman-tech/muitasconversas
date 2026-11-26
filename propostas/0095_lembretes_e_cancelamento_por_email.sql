-- PROPOSTA 0095 — NÃO APLICADA (testada em rollback). Depende da 0089 (email_outbox).
-- Enfileira (não envia) e-mails: lembrete de renovação D-3/D-1, lembrete de devolução
-- (usa a view reminders_due da 0051, que hoje ninguém consome) e "cancelamento
-- confirmado" (trigger quando cancel_requested_at passa de null para preenchido).
-- Quem envia: edge function send-emails (propostas/send-emails/index.ts), NÃO ativada.
create or replace function public.mc_queue_loan_reminders() returns int
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare r record; n int := 0;
begin
  for r in select rd.*, l.customer_id from reminders_due rd join loans l on l.id = rd.loan_id loop
    perform mc_queue_email(r.customer_id, r.kind, r.dedupe_key,
      'Seu livro "' || r.book_title || '" vence em ' || r.days_until_due || (case when r.days_until_due = 1 then ' dia' else ' dias' end),
      'Olá, ' || coalesce(split_part(r.full_name, ' ', 1), '') || '! O livro "' || r.book_title || '" deve ser devolvido até ' || to_char(r.due_date, 'DD/MM/YYYY') || '. Se precisar de mais tempo ou quiser agendar a retirada, acesse Minha conta.', r.loan_id);
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function public.mc_queue_loan_reminders() from public, anon, authenticated;

create or replace function public.mc_queue_renewal_reminders() returns int
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare r record; n int := 0; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in
    select s.customer_id, s.id sid,
           coalesce((p.raw->>'next_payment_date')::timestamptz at time zone 'America/Sao_Paulo', s.current_period_end::timestamp)::date nxt
      from subscriptions s join mp_preapprovals p on p.subscription_id = s.id
     where s.status = 'active' and s.cancel_requested_at is null and p.status = 'authorized'
  loop
    if r.nxt is not null and r.nxt - v_today in (1, 3) then
      perform mc_queue_email(r.customer_id, 'renewal_d' || (r.nxt - v_today), 'renewal_d' || (r.nxt - v_today) || ':' || r.sid || ':' || r.nxt,
        'Sua assinatura renova em ' || (r.nxt - v_today) || (case when r.nxt - v_today = 1 then ' dia' else ' dias' end),
        'Olá! Sua assinatura do Muitas Conversas será renovada em ' || to_char(r.nxt, 'DD/MM/YYYY') || '. Para cancelar sem nova cobrança, acesse Minha conta antes dessa data.');
      n := n + 1;
    end if;
  end loop;
  return n;
end $f$;
revoke all on function public.mc_queue_renewal_reminders() from public, anon, authenticated;

create or replace function public.mc_queue_cancel_confirmed() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if old.cancel_requested_at is null and new.cancel_requested_at is not null then
    perform mc_queue_email(new.customer_id, 'cancel_confirmed', 'cancel_confirmed:' || new.id || ':' || extract(epoch from new.cancel_requested_at)::bigint,
      'Cancelamento da assinatura confirmado',
      'Olá! Recebemos o seu pedido de cancelamento. Você continua com acesso completo até ' || coalesce(to_char(new.current_period_end, 'DD/MM/YYYY'), 'o fim do período pago') || ' e não haverá nova cobrança. Para voltar a assinar, é só acessar Minha conta.');
  end if;
  return null;
end $f$;
revoke all on function public.mc_queue_cancel_confirmed() from public, anon, authenticated;
drop trigger if exists trg_cancel_confirmed on public.subscriptions;
create trigger trg_cancel_confirmed after update of cancel_requested_at on public.subscriptions
  for each row execute function public.mc_queue_cancel_confirmed();

-- Agendamento (NÃO CRIAR sem autorização; só depois de send-emails estar no ar):
-- select cron.schedule('mc-queue-reminders', '0 11 * * *', $$select mc_queue_loan_reminders(), mc_queue_renewal_reminders()$$);
-- select cron.schedule('mc-send-emails', '*/10 * * * *', <net.http_post para /functions/v1/send-emails com x-sync-secret>);
