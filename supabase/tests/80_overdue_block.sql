begin;
select t.mk_customer(n) from generate_series(1,4) n;
select t.mk_staff(90,'ops');
select t.mk_book('Atrasado',1) as bo \gset
select t.mk_book('Fila',1) as bq \gset
select t.mk_book('Outro',1) as bx \gset
select t.mk_book('Entrega',1) as bd \gset
select t.mk_window(5) as w \gset

-- cliente 1 em atraso
select t.mk_overdue(t.uid(1), :'bo', 3) as l1 \gset
select t.eq(mc_is_overdue_blocked(t.uid(1)), true, 'bloqueado: loan active vencido (grace 0)');
select t.eq(mark_overdue(), 1, 'mark_overdue');
select t.eq(mc_is_overdue_blocked(t.uid(1)), true, 'bloqueado: loan overdue');
select t.eq(mc_is_overdue_blocked(t.uid(2)), false, 'cliente sem atraso não bloqueado');
select t.login(t.uid(1));
select t.throws(format($$select reserve_book(%L)$$, :'bx'), 'overdue_blocked', 'reserve_book bloqueado');
select t.eq((select blocked_by_overdue from my_account), true, 'my_account.blocked_by_overdue');
select t.eq((select overdue_since from my_account), (now() at time zone 'America/Sao_Paulo')::date - 3, 'my_account.overdue_since');
select t.eq((select full_name from my_account), 'Cliente 1', 'my_account mantém colunas da frente A');
select t.logout();
select t.login(t.uid(2));
select t.eq((select blocked_by_overdue from my_account), false, 'my_account cliente 2 não bloqueado');
select t.logout();

-- carência e chave
update settings set value='5' where key='overdue_block_grace_days';
select t.eq(mc_is_overdue_blocked(t.uid(1)), false, 'carência de 5 dias: não bloqueado');
update settings set value='0' where key='overdue_block_grace_days';
update settings set value='false' where key='overdue_block_enabled';
select t.eq(mc_is_overdue_blocked(t.uid(1)), false, 'desabilitado: não bloqueado');
update settings set value='true' where key='overdue_block_enabled';

-- promoção pula bloqueado e re-dispara ao devolver
select t.login(t.uid(2)); select reserve_book(:'bq'); select t.logout();             -- offered ao 2
insert into reservations(customer_id, book_id, status) values (t.uid(1), :'bq', 'queued');  -- 1 na fila (bloqueado)
update reservations set hold_expires_at = now() - interval '1 minute' where customer_id=t.uid(2);
select t.eq(expire_holds(), 1, 'guarda do cliente 2 expira');
select t.eq((select status::text from reservations where customer_id=t.uid(1) and book_id=:'bq'), 'queued', 'promoção pulou o bloqueado');
select t.eq((select status::text from copies where book_id=:'bq'), 'available', 'cópia fica available (ninguém elegível)');
select t.login(t.uid(90)); select register_return(:'l1'::uuid, 'good'); select t.logout();
select t.eq(mc_is_overdue_blocked(t.uid(1)), false, 'bloqueio some ao devolver');
select t.eq((select status::text from reservations where customer_id=t.uid(1) and book_id=:'bq'), 'offered', 're-disparo: cliente 1 promovido na devolução');

-- coleta-only
select t.login(t.uid(3)); select reserve_book(:'bd'); select t.logout();               -- offered
select t.mk_book('Atraso3',1) as b3 \gset
select t.mk_overdue(t.uid(3), :'b3', 2) as l3 \gset
select t.login(t.uid(3));
select (schedule_visit(:w, t.addr(t.uid(3)), null)).id as vv \gset
select t.logout();
select t.eq((select string_agg(direction::text, ',') from visit_items where visit_id=:'vv'), 'collect', 'bloqueado: só coleta');
select t.eq((select status::text from reservations where customer_id=t.uid(3) and book_id=:'bd'), 'offered', 'reserva offered intacta');
select t.eq((select count(*)::int from loans where customer_id=t.uid(3) and status='scheduled'), 0, 'nenhum loan scheduled');
select t.eq(mc_is_overdue_blocked(t.uid(3)), true, 'segue bloqueado até devolver (return_requested)');
select t.login(t.uid(90)); select register_return(:'l3'::uuid, 'good'); select t.logout();
select t.eq(mc_is_overdue_blocked(t.uid(3)), false, 'desbloqueado após devolução');
select t.mk_window(5) as w2 \gset
select t.login(t.uid(3));
select (schedule_visit(:w2, t.addr(t.uid(3)), null)).id as vv2 \gset
select t.logout();
select t.eq((select string_agg(direction::text, ',') from visit_items where visit_id=:'vv2'), 'deliver', 'após desbloqueio: entrega agendada');
rollback;
