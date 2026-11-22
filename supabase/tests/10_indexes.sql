begin;
select t.mk_customer(1); select t.mk_customer(2);
select t.mk_book('Livro A', 2) as a \gset
select t.mk_book('Livro B', 1) as b \gset

-- 1 assinatura ativa por cliente
select t.throws($$insert into subscriptions(customer_id,status) values (t.uid(1),'pending')$$, '23505', 'segunda assinatura não cancelada rejeitada');
update subscriptions set status='canceled' where customer_id = t.uid(1);
insert into subscriptions(customer_id,status) values (t.uid(1),'active');
select t.eq((select count(*)::int from subscriptions where customer_id=t.uid(1) and status<>'canceled'), 1, 'cancelada + nova ativa permitido');

-- 1 reserva ativa por cliente+título
insert into reservations(customer_id, book_id, status) values (t.uid(1), :'a', 'queued');
select t.throws(format($$insert into reservations(customer_id,book_id,status) values (%L,%L,'queued')$$, t.uid(1), :'a'), '23505', 'reserva duplicada ativa rejeitada');
update reservations set status='canceled', closed_at=now() where customer_id=t.uid(1);
insert into reservations(customer_id, book_id, status) values (t.uid(1), :'a', 'queued');
select t.eq((select count(*)::int from reservations where customer_id=t.uid(1) and book_id=:'a'), 2, 'nova reserva após cancelar permitida');

-- 1 empréstimo em posse por assinante e por exemplar
select id as c1 from copies where label_code='Livro A-1' \gset
select id as c2 from copies where label_code='Livro A-2' \gset
select id as c3 from copies where label_code='Livro B-1' \gset
insert into loans(customer_id, copy_id, status, due_date) values (t.uid(1), :'c1', 'active', current_date+28);
select t.throws(format($$insert into loans(customer_id,copy_id,status) values (%L,%L,'active')$$, t.uid(1), :'c3'), '23505', 'segundo empréstimo em posse do assinante rejeitado');
select t.throws(format($$insert into loans(customer_id,copy_id,status) values (%L,%L,'active')$$, t.uid(2), :'c1'), '23505', 'mesmo exemplar em dois empréstimos abertos rejeitado');
-- 1 agendado por assinante (troca permite agendado + em posse)
insert into loans(customer_id, copy_id, status) values (t.uid(1), :'c2', 'scheduled');
select t.throws(format($$insert into loans(customer_id,copy_id,status) values (%L,%L,'scheduled')$$, t.uid(1), :'c3'), '23505', 'segundo agendado do assinante rejeitado');
update loans set status='returned', returned_at=now() where copy_id=:'c1';
insert into loans(customer_id, copy_id, status) values (t.uid(2), :'c1', 'active');
select t.eq((select count(*)::int from loans where copy_id=:'c1' and status='active'), 1, 'exemplar reutilizável após devolução');
rollback;
