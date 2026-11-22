-- Helpers de teste (schema t)
create schema t;
grant usage on schema t to authenticated, anon, service_role;

create function t.uid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function t.eq(actual anyelement, expected anyelement, name text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALHOU: % (esperado %, obtido %)', name, expected, actual;
  end if;
  raise notice 'ok - %', name;
end $$;

-- Executa sql (no papel atual) e exige erro; confere DETAIL (código) ou SQLSTATE
create function t.throws(sql text, expected text, name text) returns void language plpgsql as $$
declare v_detail text; v_state text; v_msg text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail, v_state = returned_sqlstate, v_msg = message_text;
    if v_detail = expected or v_state = expected then
      raise notice 'ok - % (%)', name, coalesce(nullif(v_detail,''), v_state);
      return;
    end if;
    raise exception 'FALHOU: % (erro inesperado: state=% detail=% msg=%)', name, v_state, v_detail, v_msg;
  end;
  raise exception 'FALHOU: % (nenhum erro; esperado %)', name, expected;
end $$;

create function t.area() returns int language sql as $$
  insert into served_areas(name) values ('Gávea') on conflict (name) do update set name = excluded.name returning id $$;

create function t.mk_customer(n int, with_sub boolean default true) returns uuid language plpgsql as $$
declare v uuid := t.uid(n);
begin
  insert into auth.users(id, email) values (v, 'c'||n||'@t.test');
  insert into customers(id, full_name, email) values (v, 'Cliente '||n, 'c'||n||'@t.test');
  if with_sub then insert into subscriptions(customer_id, status) values (v, 'active'); end if;
  insert into addresses(customer_id, area_id, cep, street, number) values (v, t.area(), '22451000', 'Rua X', n::text);
  return v;
end $$;

create function t.mk_staff(n int, r staff_role) returns uuid language plpgsql as $$
declare v uuid := t.uid(n);
begin
  insert into auth.users(id, email) values (v, 's'||n||'@t.test');
  insert into staff_members(user_id, role) values (v, r);
  return v;
end $$;

create function t.mk_book(title text, ncopies int) returns uuid language plpgsql as $$
declare b uuid;
begin
  insert into books(title) values (title) returning id into b;
  for i in 1..ncopies loop
    insert into copies(book_id, label_code) values (b, title||'-'||i);
  end loop;
  return b;
end $$;

create function t.mk_window(cap int, cutoff_in interval default '2 days') returns int language plpgsql as $$
declare d int; w int;
begin
  insert into delivery_days(day, cutoff_at) values (current_date + 7 + (select count(*)::int from delivery_days), now() + cutoff_in) returning id into d;
  insert into delivery_windows(delivery_day_id, area_id, starts_at, ends_at, capacity)
    values (d, t.area(), '09:00', '12:00', cap) returning id into w;
  return w;
end $$;

create function t.addr(cust uuid) returns uuid language sql as $$ select id from addresses where customer_id = cust $$;

-- Simula login: papel authenticated + sub
create function t.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
end $$;
create function t.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Empréstimo em posse vencido há p_days dias (status active; use mark_overdue() para virar overdue)
create function t.mk_overdue(cust uuid, p_book uuid, p_days int) returns uuid language plpgsql as $$
declare c uuid; l uuid;
begin
  select id into c from copies where book_id = p_book and status = 'available' limit 1;
  update copies set status = 'on_loan' where id = c;
  insert into loans(customer_id, copy_id, status, delivered_at, due_date)
    values (cust, c, 'active', now() - interval '40 days', (now() at time zone 'America/Sao_Paulo')::date - p_days)
    returning id into l;
  return l;
end $$;
