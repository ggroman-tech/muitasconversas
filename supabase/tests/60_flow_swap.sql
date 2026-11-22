-- Troca de sábado: coleta do livro atual + entrega do novo na mesma visita
begin;
select t.mk_customer(1); select t.mk_staff(90,'ops'); select t.mk_staff(91,'driver');
select t.mk_book('Velho', 1) as old \gset
select t.mk_book('Novo', 1) as new \gset
select t.mk_window(5) as w \gset
select t.login(t.uid(1)); select reserve_book(:'old'); select (schedule_visit(:w, t.addr(t.uid(1)), null)).id as v1 \gset
select t.logout();
select t.login(t.uid(91)); select confirm_delivery(:'v1'); select t.logout();

-- reserve_while_reading
select t.login(t.uid(1));
select t.eq((reserve_book(:'new')).status::text, 'offered', 'reserve_while_reading=true: reserva durante leitura');
select t.logout();
update reservations set status='canceled', closed_at=now() where book_id=:'new';
update copies set status='available' where book_id=:'new';
update settings set value='false' where key='reserve_while_reading';
select t.login(t.uid(1));
select t.throws(format($$select reserve_book(%L)$$, :'new'), 'reserve_while_reading_off', 'reserve_while_reading=false bloqueia');
select t.logout();
update settings set value='true' where key='reserve_while_reading';
select t.login(t.uid(1)); select reserve_book(:'new'); select t.logout();

-- troca
select t.mk_window(5) as w2 \gset
select t.login(t.uid(1));
select (schedule_visit(:w2, t.addr(t.uid(1)), null)).id as v2 \gset
select t.logout();
select t.eq((select count(*)::int from visit_items where visit_id=:'v2'), 2, 'troca: 2 itens (collect + deliver)');
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'old'), 'return_requested', 'livro antigo return_requested');
select t.login(t.uid(91)); select confirm_delivery(:'v2'); select t.logout();
select t.eq((select l.status::text from loans l join copies c on c.id=l.copy_id where c.book_id=:'new'), 'active', 'livro novo active');
select t.login(t.uid(90));
select register_return((select l.id from loans l join copies c on c.id=l.copy_id where c.book_id=:'old'), 'good');
select t.logout();
select t.eq((select status::text from copies where book_id=:'old'), 'available', 'livro antigo volta available');
select t.eq((select count(*)::int from loans where customer_id=t.uid(1) and status in ('active','overdue')), 1, 'apenas 1 em posse');
rollback;
