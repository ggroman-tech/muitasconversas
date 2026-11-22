begin;
select t.mk_customer(n) from generate_series(1,3) n;
select t.mk_customer(4, false);
select t.mk_book('Oferta',1) as bo \gset
select t.mk_book('Posse',1) as bp \gset
select t.mk_window(5) as w \gset
-- janela de outro bairro (não deve aparecer) e dia fechado
insert into served_areas(name) values ('Longe') returning id as far \gset
insert into delivery_windows(delivery_day_id, area_id, starts_at, ends_at, capacity)
  select delivery_day_id, :far, '09:00','14:00', 5 from delivery_windows where id = :w;
insert into delivery_days(day, cutoff_at, status) values (current_date + 40, now() + interval '30 days', 'closed');
insert into delivery_days(day, cutoff_at) values (current_date + 41, now() - interval '1 hour');

select t.login(t.uid(1)); select reserve_book(:'bo'); select t.logout();
select t.mk_overdue(t.uid(2), :'bp', 0) as l2 \gset
update loans set due_date = current_date + 5 where id = :'l2';

-- cliente 1: entrega
select t.login(t.uid(1));
select t.eq(jsonb_array_length(schedule_options()->'days'), 1, 'só sábado aberto antes do corte');
select t.eq(jsonb_array_length(schedule_options()->'days'->0->'windows'), 1, 'só janela do bairro do cliente');
select t.eq(schedule_options()->'deliver'->>'title', 'Oferta', 'entrega do livro oferecido');
select t.eq(jsonb_array_length(schedule_options()->'collect'), 0, 'sem coleta');
select t.eq(jsonb_array_length(schedule_options()->'addresses'), 1, 'um endereço');
select t.eq((schedule_options()->>'blocked_by_overdue')::boolean, false, 'não bloqueado');
select t.logout();

-- cliente 2: coleta; cliente 3: nada
select t.login(t.uid(2));
select t.eq(schedule_options()->'collect'->0->>'title', 'Posse', 'coleta do livro em posse');
select t.eq(jsonb_typeof(schedule_options()->'deliver'), 'null', 'sem entrega');
select t.logout();
select t.login(t.uid(3));
select t.eq(jsonb_array_length(schedule_options()->'collect'), 0, 'cliente 3 nada a coletar');
select t.logout();

-- visita agendada marca already_scheduled; não vaza a de outro cliente
select t.login(t.uid(1)); select schedule_visit(:w, t.addr(t.uid(1)), null); select t.logout();
select t.login(t.uid(1));
select t.eq((schedule_options()->'days'->0->>'already_scheduled')::boolean, true, 'já agendado neste sábado');
select t.logout();
select t.login(t.uid(3));
select t.eq((schedule_options()->'days'->0->>'already_scheduled')::boolean, false, 'visita de outro cliente não aparece');
select t.logout();

-- bloqueado por atraso: sem entrega, oferta retida
select t.mk_book('Oferta2',1) as bo2 \gset
select t.mk_book('Atraso',1) as ba \gset
select t.login(t.uid(3)); select reserve_book(:'bo2'); select t.logout();
select t.mk_overdue(t.uid(3), :'ba', 2);
select t.login(t.uid(3));
select t.eq((schedule_options()->>'blocked_by_overdue')::boolean, true, 'bloqueado por atraso');
select t.eq(jsonb_typeof(schedule_options()->'deliver'), 'null', 'bloqueado: sem entrega');
select t.eq((schedule_options()->>'offer_held_back')::boolean, true, 'oferta retida');
select t.eq(jsonb_array_length(schedule_options()->'collect'), 1, 'bloqueado: só coleta');
select t.logout();

-- assinatura inativa e acesso
select t.login(t.uid(4));
select t.eq((schedule_options()->>'has_active_subscription')::boolean, false, 'sem assinatura ativa');
select t.logout();
select t.login(null);
select t.throws($$select schedule_options()$$, 'not_authenticated', 'anônimo bloqueado');
select t.logout();
rollback;
