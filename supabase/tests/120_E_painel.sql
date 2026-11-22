-- Frente E — painel: views de leitura (staff x cliente) e generate_delivery_days.
begin;
select t.mk_customer(n) from generate_series(1,3) n;
select t.mk_staff(80,'admin'); select t.mk_staff(81,'ops'); select t.mk_staff(82,'driver');
select t.mk_book('P1',1) as b1 \gset
select t.mk_book('P2',1) as b2 \gset
select t.mk_window(5) as w \gset

-- cliente 1 reserva e agenda (entrega); cliente 2 fica atrasado; cliente 3 entra na fila de P1
select t.login(t.uid(1)); select reserve_book(:'b1');
select (schedule_visit(:w, t.addr(t.uid(1)), 'portaria 24h')).id as v1 \gset
select t.logout();
select t.mk_overdue(t.uid(2), :'b2', 5) as l2 \gset
select t.login(t.uid(3)); select reserve_book(:'b1'); select t.logout();

-- 1) cliente comum não enxerga nada
select t.login(t.uid(1));
select t.eq((select count(*)::int from saturday_route), 0, 'cliente: saturday_route vazia');
select t.eq((select count(*)::int from painel_route_loans), 0, 'cliente: painel_route_loans vazia');
select t.eq((select count(*)::int from painel_saturdays), 0, 'cliente: painel_saturdays vazia');
select t.eq((select count(*)::int from painel_reservations_waiting), 0, 'cliente: reservas aguardando vazia');
select t.eq((select count(*)::int from overdue_loans), 0, 'cliente: overdue_loans vazia');
select t.throws($$select generate_delivery_days(2)$$, 'forbidden', 'cliente não gera sábados');
select t.logout();

-- 2) driver: rota sim; atrasos/sábados/reservas não; não gera sábados
select t.login(t.uid(82));
select t.eq((select count(*)::int from saturday_route), 1, 'driver vê a rota');
select t.eq((select count(*)::int from painel_route_loans where visit_id = :'v1' and direction='deliver' and loan_status='scheduled'), 1, 'driver vê status do loan da rota');
select t.eq((select count(*)::int from overdue_loans), 0, 'driver não vê atrasos');
select t.eq((select count(*)::int from painel_saturdays), 0, 'driver não vê sábados');
select t.eq((select count(*)::int from painel_reservations_waiting), 0, 'driver não vê reservas');
select t.throws($$select generate_delivery_days(2)$$, 'forbidden', 'driver não gera sábados');
select t.throws($$select register_return(gen_random_uuid(), 'good')$$, 'forbidden', 'driver não registra devolução');
select t.logout();

-- 3) ops: tudo
select t.login(t.uid(81));
select t.eq((select count(*)::int from overdue_loans where customer_email = 'c2@t.test'), 1, 'ops vê atraso com contato');
select t.eq((select visits_count from painel_saturdays where delivery_day_id = (select delivery_day_id from delivery_windows where id = :w)), 1, 'sábado conta 1 visita');
select t.eq((select count(*)::int from painel_reservations_waiting where reservation_status = 'offered' and customer_name = 'Cliente 3'), 0, 'cliente 3 não tem oferta');
select t.eq((select queue_position from painel_reservations_waiting where customer_name = 'Cliente 3'), 1, 'cliente 3 é o 1º da fila');
select t.eq((select bool_and(cutoff_passed = false) from painel_saturdays where delivery_day_id = (select delivery_day_id from delivery_windows where id = :w)), true, 'cutoff_passed falso para sábado futuro');
select t.throws($$select generate_delivery_days(0)$$, 'invalid_weeks', 'weeks 0 inválido');
select t.throws($$select generate_delivery_days(27)$$, 'invalid_weeks', 'weeks 27 inválido');
select t.eq((generate_delivery_days(2)->>'days_created')::int between 1 and 2, true, 'ops gera os sábados (1 já pode existir do helper)');
select t.eq((generate_delivery_days(2)->>'days_created')::int, 0, 'geração é idempotente');
select t.eq((select count(*)::int from painel_saturdays where extract(dow from day) = 6), 2, 'painel lista os 2 sábados gerados');
select t.eq((select bool_and(cutoff_at = ((day + time '09:00') at time zone 'America/Sao_Paulo') - interval '1 hour') from painel_saturdays where extract(dow from day) = 6 and delivery_day_id <> (select delivery_day_id from delivery_windows where id = :w)), true, 'cutoff às 08h (America/Sao_Paulo)');
select t.logout();

-- 4) admin gera; config pendente vira config_pending
select t.login(t.uid(80));
select t.eq((generate_delivery_days(3)->>'days_created')::int, 1, 'admin gera 3 semanas (1 nova)');
select t.logout();
update settings set value = 'null'::jsonb where key = 'window_capacity';
select t.login(t.uid(80));
select t.throws($$select generate_delivery_days(1)$$, 'config_pending', 'config pendente -> config_pending');
select t.logout();

-- 5) driver confirma entrega; ops registra devolução; loan some do status scheduled
select t.login(t.uid(82)); select confirm_delivery(:'v1'::uuid); select t.logout();
select t.login(t.uid(81));
select t.eq((select loan_status::text from painel_route_loans where visit_id = :'v1'), 'active', 'após confirmar: loan active');
select register_return(:'l2'::uuid, 'fair');
select t.eq((select count(*)::int from overdue_loans), 0, 'após devolução: sem atraso');
select t.logout();
rollback;
