begin;
select t.mk_customer(n) from generate_series(1,3) n;
select t.mk_staff(90,'ops');
select t.mk_book('Guarda', 1) as b \gset
select t.login(t.uid(1)); select reserve_book(:'b'); select t.logout();
select t.login(t.uid(2)); select reserve_book(:'b'); select t.logout();
update reservations set queued_at = now() - interval '1 hour' where customer_id = t.uid(1);
update reservations set queued_at = now() where customer_id = t.uid(2);

select t.eq(expire_holds(), 0, 'nada expira antes do prazo');
update reservations set hold_expires_at = now() - interval '1 minute' where customer_id = t.uid(1);

-- cliente comum não pode rodar manutenção
select t.login(t.uid(3));
select t.throws($$select expire_holds()$$, 'forbidden', 'cliente não executa expire_holds');
select t.logout();

select t.eq(expire_holds(), 1, 'expire_holds expira 1 guarda (service)');
select t.eq((select status::text from reservations where customer_id=t.uid(1)), 'expired', 'reserva 1 expired');
select t.eq((select status::text from reservations where customer_id=t.uid(2)), 'offered', 'próximo da fila recebe o exemplar');
select t.eq((select status::text from copies where book_id=:'b'), 'held', 'exemplar segue held (para o próximo)');
-- expira o último: exemplar volta a available
update reservations set hold_expires_at = now() - interval '1 minute' where customer_id = t.uid(2);
select t.eq(expire_holds(), 1, 'segunda expiração');
select t.eq((select status::text from copies where book_id=:'b'), 'available', 'sem fila: exemplar available');
-- cliente 1 pode reservar de novo após expirar
select t.login(t.uid(1));
select t.eq((reserve_book(:'b')).status::text, 'offered', 'nova reserva após expirar');
select t.logout();

-- guarda expirada (ainda não varrida) não vira entrega
select t.mk_window(5) as w \gset
update reservations set hold_expires_at = now() - interval '1 minute' where customer_id = t.uid(1) and status='offered';
select t.login(t.uid(1));
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w, t.addr(t.uid(1))), 'nothing_to_do', 'guarda vencida não permite agendar entrega');
select t.logout();

-- mark_overdue
select t.mk_book('Atraso', 1) as b2 \gset
select id as c from copies where book_id=:'b2' \gset
insert into loans(customer_id, copy_id, status, due_date, delivered_at) values (t.uid(3), :'c', 'active', (now() at time zone 'America/Sao_Paulo')::date - 3, now());
update copies set status='on_loan' where id=:'c';
select t.eq(mark_overdue(), 1, 'mark_overdue marca 1');
select t.eq((select status::text from loans where customer_id=t.uid(3)), 'overdue', 'loan overdue');
select t.login(t.uid(90));
select t.eq((select days_overdue from overdue_loans), 3, 'view overdue_loans: 3 dias');
select t.logout();
select t.login(t.uid(3));
select t.eq((select count(*)::int from overdue_loans), 0, 'cliente não vê overdue_loans');
rollback;
