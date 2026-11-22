begin;
select t.mk_customer(n) from generate_series(1,4) n;
select t.mk_staff(90,'ops');
select t.mk_book(format('L%s', n), 1) from generate_series(1,4) n;
select t.mk_window(2) as w \gset
select t.mk_window(5, interval '-1 hour') as wclosed \gset

-- cada cliente reserva um livro (oferta imediata)
select t.login(t.uid(1)); select reserve_book((select id from books where title='L1')); select t.logout();
select t.login(t.uid(2)); select reserve_book((select id from books where title='L2')); select t.logout();
select t.login(t.uid(3)); select reserve_book((select id from books where title='L3')); select t.logout();

select t.login(t.uid(1)); select schedule_visit(:w, t.addr(t.uid(1)), null); 
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w, t.addr(t.uid(1))), 'already_scheduled', 'mesmo cliente não agenda duas vezes no sábado');
select t.logout();
select t.login(t.uid(2)); select schedule_visit(:w, t.addr(t.uid(2)), null); select t.logout();
select t.login(t.uid(3));
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w, t.addr(t.uid(3))), 'window_full', 'janela lotada rejeita (capacidade 2)');
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :wclosed, t.addr(t.uid(3))), 'cutoff_passed', 'após cutoff rejeita');
select t.logout();
select t.eq((select count(*)::int from visits where window_id=:w), 2, 'apenas 2 visitas na janela');
select t.eq((select count(*)::int from visit_items), 2, 'visit_items criados (1 entrega por visita)');
-- cliente sem nada a fazer
select t.mk_window(5) as w3 \gset
select t.login(t.uid(4));
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w3, t.addr(t.uid(4))), 'nothing_to_do', 'sem reserva/livro: nada a agendar');
select t.logout();
-- vaga reaberta ao cancelar visita
update visits set status='canceled' where customer_id=t.uid(2);
select t.login(t.uid(3)); select schedule_visit(:w, t.addr(t.uid(3)), null); select t.logout();
select t.eq((select count(*)::int from visits where window_id=:w and status<>'canceled'), 2, 'visita cancelada libera vaga');
-- endereço de outro cliente
select t.login(t.uid(4));
select t.throws(format($$select schedule_visit(%s, %L, null)$$, :w, t.addr(t.uid(1))), 'address_not_found', 'endereço de outro cliente rejeitado');
select t.logout();
rollback;
