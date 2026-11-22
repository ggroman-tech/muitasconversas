begin;
select t.mk_customer(n) from generate_series(1,5) n;
select t.mk_staff(90,'ops');
select t.mk_book('Fila', 1) as b \gset
select t.mk_customer(6, false);

-- sem assinatura ativa
select t.login(t.uid(6));
select t.throws(format($$select reserve_book(%L)$$, :'b'), 'no_active_subscription', 'reserva exige assinatura ativa');
-- não autenticado
select t.logout();
select t.throws(format($$select reserve_book(%L)$$, :'b'), 'not_authenticated', 'reserva exige login');

-- 1: exemplar livre + fila vazia => offered/held
select t.login(t.uid(1));
select (reserve_book(:'b')).status::text as s1 \gset
select t.logout();
select t.eq(:'s1'::text, 'offered'::text, 'cliente 1 recebe oferta imediata');
select t.eq((select status::text from copies where book_id=:'b'), 'held', 'exemplar fica held');
select t.eq((select (hold_expires_at > now() + interval '71 hours' and hold_expires_at < now() + interval '73 hours') from reservations where customer_id=t.uid(1)), true, 'hold_expires_at = now()+72h');

-- duplicado
select t.login(t.uid(1));
select t.throws(format($$select reserve_book(%L)$$, :'b'), 'already_reserved', 'reserva duplicada rejeitada');

-- 2,3,4 entram na fila na ordem
select t.logout();
select t.login(t.uid(2)); select reserve_book(:'b'); select t.logout();
select t.login(t.uid(3)); select reserve_book(:'b'); select t.logout();
select t.login(t.uid(4)); select reserve_book(:'b'); select t.logout();
update reservations set queued_at = now() + (right(customer_id::text,2)::int || ' minutes')::interval where book_id=:'b';
select t.eq((select string_agg(status::text, ',' order by queued_at, id) from reservations where book_id=:'b'), 'offered,queued,queued,queued', 'demais ficam queued');
-- garante queued_at estritamente crescente (now() é fixo na transação)

-- cliente 1 pega o livro (agenda + entrega + devolve) -> promove cliente 2 (FIFO)
select id as c from copies where book_id=:'b' \gset
insert into delivery_days(day, cutoff_at) values (current_date+7, now()+interval '2 days');
insert into delivery_windows(delivery_day_id, area_id, starts_at, ends_at, capacity) values ((select max(id) from delivery_days), t.area(), '09:00','12:00', 10);
select max(id) as w from delivery_windows \gset
select t.login(t.uid(1));
select (schedule_visit(:w, t.addr(t.uid(1)), 'portaria')).id as vid \gset
select t.logout();
select t.login(t.uid(90));
select confirm_delivery(:'vid'::uuid);
select id as loan from loans where customer_id=t.uid(1) \gset
select t.eq((select status::text from loans where id=:'loan'), 'active', 'confirm_delivery => active');
select t.eq((select due_date from loans where id=:'loan'), (now() at time zone 'America/Sao_Paulo')::date + 28, 'due_date = hoje + loan_days');
select t.eq((select status::text from copies where id=:'c'), 'on_loan', 'copy on_loan');
select register_return(:'loan', 'good');
select t.logout();
select t.eq((select status::text from reservations where customer_id=t.uid(2)), 'offered', 'FIFO: cliente 2 promovido ao devolver');
select t.eq((select status::text from reservations where customer_id=t.uid(3)), 'queued', 'cliente 3 segue na fila');
select t.eq((select status::text from copies where id=:'c'), 'held', 'exemplar volta a held para o próximo');

-- devolução com dano: não promove ninguém
select t.login(t.uid(2));
select (schedule_visit(:w, t.addr(t.uid(2)), null)).id as v2 \gset
select t.logout();
select t.login(t.uid(90));
select confirm_delivery(:'v2'::uuid);
select id as loan2 from loans where customer_id=t.uid(2) \gset
select register_return(:'loan2', 'damaged');
select t.logout();
select t.eq((select status::text from copies where id=:'c'), 'damaged', 'devolução damaged => copy damaged');
select t.eq((select status::text from reservations where customer_id=t.uid(3)), 'queued', 'copy damaged não promove fila');
-- condição inválida / permissão
select t.login(t.uid(3));
select t.throws(format($$select register_return(%L,'good')$$, :'loan2'), 'forbidden', 'cliente não registra devolução');
rollback;
