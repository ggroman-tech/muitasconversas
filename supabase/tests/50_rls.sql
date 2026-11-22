begin;
select t.mk_customer(1); select t.mk_customer(2);
select t.mk_staff(90,'ops'); select t.mk_staff(91,'driver');
select t.mk_book('R', 2) as b \gset
select t.mk_window(5) as w \gset
insert into payments(customer_id, subscription_id, amount_cents) values (t.uid(1), (select id from subscriptions where customer_id=t.uid(1)), 3000);
insert into payments(customer_id, subscription_id, amount_cents) values (t.uid(2), (select id from subscriptions where customer_id=t.uid(2)), 3000);
insert into consents(customer_id, purpose, version, granted) values (t.uid(1),'privacy','v1',true),(t.uid(2),'privacy','v1',true);
select t.login(t.uid(1)); select reserve_book(:'b'); select schedule_visit(:w, t.addr(t.uid(1)), 'n'); select t.logout();
select t.login(t.uid(2)); select reserve_book(:'b'); select t.logout();

-- cliente 1 vê só o próprio
select t.login(t.uid(1));
select t.eq((select count(*)::int from customers), 1, 'customers: só o próprio');
select t.eq((select count(*)::int from addresses), 1, 'addresses: só o próprio');
select t.eq((select count(*)::int from reservations), 1, 'reservations: só a própria');
select t.eq((select count(*)::int from loans), 1, 'loans: só o próprio');
select t.eq((select count(*)::int from visits), 1, 'visits: só a própria');
select t.eq((select count(*)::int from visit_items), 1, 'visit_items: só os próprios');
select t.eq((select count(*)::int from payments), 1, 'payments: só o próprio');
select t.eq((select count(*)::int from consents), 1, 'consents: só o próprio');
-- escrita direta negada
select t.throws($$update customers set full_name='x'$$, '42501', 'update direto em customers negado');
select t.throws($$insert into reservations(customer_id,book_id) values (t.uid(1), (select id from books limit 1))$$, '42501', 'insert direto em reservations negado');
select t.throws($$update loans set status='returned'$$, '42501', 'update direto em loans negado');
select t.throws($$delete from visits$$, '42501', 'delete direto em visits negado');
select t.throws($$insert into payments(customer_id,subscription_id,amount_cents) values (t.uid(1), (select id from subscriptions limit 1), 1)$$, '42501', 'insert direto em payments negado');
select t.throws($$insert into consents(customer_id,purpose,version,granted) values (t.uid(1),'x','v',true)$$, '42501', 'insert direto em consents negado');
select t.throws($$insert into addresses(customer_id,area_id,cep,street,number) values (t.uid(1),1,'1','a','1')$$, '42501', 'insert direto em addresses negado');
select t.throws($$update copies set status='available'$$, '42501', 'update direto em copies negado');
select t.eq((select count(*)::int from saturday_route), 0, 'cliente não vê saturday_route');
select t.eq((select count(*)::int from staff_members), 0, 'cliente não vê staff_members');
select t.logout();

-- anon
set local role anon;
select t.throws($$select * from loans$$, '42501', 'anon sem acesso a loans');
select t.throws($$select reserve_book(null)$$, '42501', 'anon não executa RPC');
select t.logout();

-- ops vê tudo
select t.login(t.uid(90));
select t.eq((select count(*)::int from customers), 2, 'ops vê todos os customers');
select t.eq((select count(*)::int from saturday_route), 1, 'ops vê saturday_route');
select t.throws($$update loans set status='returned'$$, '42501', 'ops também não escreve direto');
select t.logout();

-- driver: só saturday_route
select t.login(t.uid(91));
select t.eq((select count(*)::int from saturday_route), 1, 'driver vê saturday_route');
select t.eq((select customer_name from saturday_route), 'Cliente 1', 'rota traz cliente');
select t.eq((select count(*)::int from customers), 0, 'driver não lê customers');
select t.eq((select count(*)::int from loans), 0, 'driver não lê loans');
select t.eq((select count(*)::int from addresses), 0, 'driver não lê addresses');
select t.eq((select count(*)::int from overdue_loans), 0, 'driver não vê overdue_loans');
select t.throws($$select register_return(gen_random_uuid(),'good')$$, 'forbidden', 'driver não registra devolução');
select t.logout();
rollback;
