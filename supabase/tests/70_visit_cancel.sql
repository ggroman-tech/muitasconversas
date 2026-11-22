begin;
select t.mk_customer(n) from generate_series(1,4) n;
select t.mk_staff(90,'ops'); select t.mk_staff(91,'driver');
select t.mk_book('V1',1) as b1 \gset
select t.mk_book('V2',1) as b2 \gset
select t.mk_book('V3',1) as b3 \gset
select t.mk_window(1) as w \gset

-- 1) cancelar antes do cutoff + liberação de vaga
select t.login(t.uid(1)); select reserve_book(:'b1');
select (schedule_visit(:w, t.addr(t.uid(1)), null)).id as v1 \gset
select t.logout();
select t.login(t.uid(2)); select reserve_book(:'b2');
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w, t.addr(t.uid(2))), 'window_full', 'janela com 1 vaga lotada');
select t.logout();
-- outro cliente não cancela
select t.login(t.uid(2));
select t.throws(format($$select cancel_visit(%L)$$, :'v1'), 'visit_not_found', 'cliente não cancela visita de outro');
select t.logout();
select t.login(t.uid(1)); select cancel_visit(:'v1'::uuid, 'desisti'); select t.logout();
select t.eq((select status::text from visits where id=:'v1'), 'canceled', 'visita canceled');
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'b1'), 'canceled', 'loan scheduled -> canceled');
select t.eq((select status::text from reservations where customer_id=t.uid(1)), 'offered', 'reserva fulfilled volta a offered');
select t.eq((select status::text from copies where book_id=:'b1'), 'held', 'cópia segue held');
select t.eq((select count(*)::int from audit_log where action='cancel_visit'), 1, 'audit_log registrou cancel_visit');
select t.login(t.uid(2)); select schedule_visit(:w, t.addr(t.uid(2)), null); select t.logout();
select t.eq((select count(*)::int from visits where window_id=:w and status not in ('canceled','failed')), 1, 'vaga liberada e reutilizada');
-- cliente 1 pode reagendar a mesma reserva em outro sábado
select t.mk_window(3) as w2 \gset
select t.login(t.uid(1)); select schedule_visit(:w2, t.addr(t.uid(1)), null); select t.logout();
select t.eq((select count(*)::int from loans where customer_id=t.uid(1) and status='scheduled'), 1, 'reagendamento cria novo loan scheduled');

-- 2) depois do cutoff: cliente não, staff sim
select t.login(t.uid(1));
select (select id from visits where customer_id=t.uid(1) and status='requested') as v1b \gset
select t.logout();
update delivery_days set cutoff_at = now() - interval '1 minute';
select t.login(t.uid(1));
select t.throws(format($$select cancel_visit(%L)$$, :'v1b'), 'cutoff_passed', 'cliente após cutoff: cutoff_passed');
select t.logout();
select t.login(t.uid(91));
select t.throws(format($$select cancel_visit(%L)$$, :'v1b'), 'visit_not_found', 'driver não cancela via cancel_visit');
select t.logout();
select t.login(t.uid(90)); select cancel_visit(:'v1b'::uuid, 'pedido por WhatsApp'); select t.logout();
select t.eq((select status::text from visits where id=:'v1b'), 'canceled', 'ops cancela após cutoff');
-- ops não cancela out_for_delivery
select (select id from visits where customer_id=t.uid(2) and status='requested') as v2 \gset
update visits set status='out_for_delivery' where id=:'v2';
select t.login(t.uid(90));
select t.throws(format($$select cancel_visit(%L)$$, :'v2'), 'invalid_visit_status', 'ops não cancela out_for_delivery');
select t.logout();

-- 3) guarda vencida no cancelamento: libera cópia, fila FIFO original e promoção
update visits set status='requested' where id=:'v2';
update delivery_days set cutoff_at = now() + interval '2 days';
select t.login(t.uid(3)); select reserve_book(:'b2'); select t.logout();   -- fila atrás do cliente 2
update reservations set queued_at = now() + interval '5 minutes' where customer_id=t.uid(3);
select queued_at as q2 from reservations where customer_id=t.uid(2) and book_id=:'b2' \gset
update reservations set hold_expires_at = now() - interval '1 minute' where customer_id=t.uid(2) and book_id=:'b2';
select t.login(t.uid(2)); select cancel_visit(:'v2'::uuid); select t.logout();
select t.eq((select queued_at from reservations where customer_id=t.uid(2) and book_id=:'b2'), :'q2'::timestamptz, 'queued_at original preservado');
select t.eq((select status::text from reservations where customer_id=t.uid(2) and book_id=:'b2'), 'offered', 'cliente 2 (primeiro da fila) recebe nova oferta');
select t.eq((select status::text from reservations where customer_id=t.uid(3) and book_id=:'b2'), 'queued', 'cliente 3 segue na fila');

-- 4) troca de sábado completa cancelada
select t.mk_book('Velho',1) as old \gset
select t.mk_book('Novo',1) as new \gset
select t.mk_window(5) as w4 \gset
select t.login(t.uid(4)); select reserve_book(:'old');
select (schedule_visit(:w4, t.addr(t.uid(4)), null)).id as va \gset
select t.logout();
select t.login(t.uid(91)); select confirm_delivery(:'va'::uuid); select t.logout();
select t.login(t.uid(4)); select reserve_book(:'new');
select (schedule_visit(:w4, t.addr(t.uid(4)), null)).id as vb \gset
select t.eq((select count(*)::int from visit_items where visit_id=:'vb'), 2, 'troca com 2 itens');
select cancel_visit(:'vb'::uuid);
select t.logout();
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'old'), 'active', 'troca cancelada: livro antigo volta a active');
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'new'), 'canceled', 'troca cancelada: novo loan canceled');
select t.eq((select status::text from reservations where customer_id=t.uid(4) and book_id=:'new'), 'offered', 'troca cancelada: reserva offered');

-- 5) falha de entrega (driver): nova guarda, coleta volta a active
update reservations set hold_expires_at = now() + interval '1 hour' where customer_id=t.uid(4) and book_id=:'new';
select t.login(t.uid(4));
select (schedule_visit(:w4, t.addr(t.uid(4)), null)).id as vc \gset
select t.throws(format($$select mark_visit_failed(%L,'x')$$, :'vc'), 'forbidden', 'cliente não marca falha');
select t.logout();
select t.login(t.uid(91)); select mark_visit_failed(:'vc'::uuid, 'ninguém em casa'); select t.logout();
select t.eq((select status::text from visits where id=:'vc'), 'failed', 'visita failed');
select t.eq((select count(*)::int from loans l join copies c on c.id=l.copy_id where c.book_id=:'new' and l.status='canceled'), 2, 'falha: loan de entrega canceled (2 cancelados no livro novo)');
select t.eq((select count(*)::int from loans l join copies c on c.id=l.copy_id where c.book_id=:'new' and l.status='scheduled'), 0, 'falha: nenhum loan scheduled');
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'old'), 'active', 'falha: coleta volta a active');
select t.eq((select hold_expires_at > now() + interval '71 hours' from reservations where customer_id=t.uid(4) and book_id=:'new'), true, 'falha: NOVA guarda de hold_hours');
select t.eq((select status::text from copies where book_id=:'new'), 'held', 'falha: cópia segue held');
select t.eq((select count(*)::int from audit_log where action='mark_visit_failed'), 1, 'audit_log registrou mark_visit_failed');
select t.eq((select count(*)::int from visits where window_id=:w4 and status not in ('canceled','failed')), 1, 'falha libera vaga (resta só a visita done)');
rollback;
