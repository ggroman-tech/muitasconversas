-- Frente C — bloqueio por atraso (decisão do dono). Multa (late_fee_cents) segue PENDENTE: nada é cobrado aqui.
insert into settings(key, value) values
  ('overdue_block_enabled', 'true'),
  ('overdue_block_grace_days', '0')
on conflict (key) do nothing;

-- Bloqueado = habilitado e existe empréstimo em posse vencido há mais que a carência
-- (status 'overdue', ou 'active'/'return_requested' com due_date < hoje(America/Sao_Paulo) - grace).
-- A carência vale também para status 'overdue'. return_requested entra para o bloqueio durar até register_return.
create or replace function mc_is_overdue_blocked(p_customer uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(mc_setting_bool('overdue_block_enabled'), false)
     and exists (
       select 1 from loans l
        where l.customer_id = p_customer
          and l.status in ('overdue','active','return_requested')
          and l.due_date < mc_today() - coalesce(mc_setting_int('overdue_block_grace_days'), 0))
$$;
revoke all on function mc_is_overdue_blocked(uuid) from public, anon, authenticated;
grant execute on function mc_is_overdue_blocked(uuid) to authenticated, service_role;

-- Funções recriadas a partir de 0040 (create or replace; grants preservados) com o bloqueio.
create or replace function mc_promote_queue(p_book_id uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hours int; v_n int := 0; v_copy uuid; v_res uuid;
begin
  perform 1 from books where id = p_book_id for update;
  loop
    v_copy := null; v_res := null;
    select id into v_copy from copies
      where book_id = p_book_id and status = 'available'
      order by label_code limit 1 for update;
    exit when v_copy is null;
    select r.id into v_res from reservations r
      where r.book_id = p_book_id and r.status = 'queued'
        and exists (select 1 from subscriptions s where s.customer_id = r.customer_id and s.status = 'active')
        and not mc_is_overdue_blocked(r.customer_id)   -- bloqueado por atraso permanece 'queued'
      order by r.queued_at, r.id limit 1 for update;
    exit when v_res is null;
    v_hours := mc_setting_int('hold_hours');
    if v_hours is null then
      perform mc_fail('config_pending','Configuração hold_hours pendente.');
    end if;
    update reservations
       set status = 'offered', offered_copy_id = v_copy,
           hold_expires_at = now() + make_interval(hours => v_hours)
     where id = v_res;
    update copies set status = 'held' where id = v_copy;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function reserve_book(p_book_id uuid) returns reservations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := mc_require_customer();
  v_res reservations; v_copy uuid; v_hours int; v_rwr boolean;
begin
  -- serializa por livro (garante FIFO e exemplar único)
  perform 1 from books where id = p_book_id for update;
  if not found then perform mc_fail('book_not_found','Livro não encontrado.'); end if;

  if not exists (select 1 from subscriptions where customer_id = v_uid and status = 'active') then
    perform mc_fail('no_active_subscription','É preciso ter uma assinatura ativa para reservar.');
  end if;

  if mc_is_overdue_blocked(v_uid) then
    perform mc_fail('overdue_blocked','Devolva o livro em atraso para fazer novas reservas.');
  end if;

  if exists (select 1 from reservations
              where customer_id = v_uid and book_id = p_book_id and status in ('queued','offered')) then
    perform mc_fail('already_reserved','Você já reservou este livro.');
  end if;

  if exists (select 1 from loans l join copies c on c.id = l.copy_id
              where l.customer_id = v_uid and c.book_id = p_book_id
                and l.status in ('scheduled','active','return_requested','overdue')) then
    perform mc_fail('already_borrowed','Este livro já está com você.');
  end if;

  if exists (select 1 from loans where customer_id = v_uid
              and status in ('scheduled','active','return_requested','overdue')) then
    v_rwr := mc_setting_bool('reserve_while_reading');
    if v_rwr is null then perform mc_fail('config_pending','Configuração reserve_while_reading pendente.'); end if;
    if not v_rwr then
      perform mc_fail('reserve_while_reading_off','Devolva o livro atual antes de reservar outro.');
    end if;
  end if;

  -- exemplar livre só se a fila estiver vazia
  if not exists (select 1 from reservations where book_id = p_book_id and status = 'queued') then
    select id into v_copy from copies
      where book_id = p_book_id and status = 'available'
      order by label_code limit 1 for update;
  end if;

  if v_copy is not null then
    v_hours := mc_setting_int('hold_hours');
    if v_hours is null then perform mc_fail('config_pending','Configuração hold_hours pendente.'); end if;
    insert into reservations(customer_id, book_id, status, offered_copy_id, hold_expires_at)
      values (v_uid, p_book_id, 'offered', v_copy, now() + make_interval(hours => v_hours))
      returning * into v_res;
    update copies set status = 'held' where id = v_copy;
  else
    insert into reservations(customer_id, book_id, status)
      values (v_uid, p_book_id, 'queued') returning * into v_res;
  end if;

  perform mc_audit('reserve_book','reservations', v_res.id::text, jsonb_build_object('status', v_res.status));
  return v_res;
end $$;

create or replace function schedule_visit(p_window_id int, p_address_id uuid, p_note text default null)
returns visits language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := mc_require_customer();
  v_win delivery_windows; v_day delivery_days; v_addr addresses;
  v_used int; v_visit visits; v_res reservations; v_loan loans;
  v_collect uuid[]; v_ncollect int; v_possessed int; v_max int;
  v_active_sub boolean; v_deliver boolean := false; v_blocked boolean;
begin
  perform 1 from customers where id = v_uid for update;   -- serializa por cliente

  select * into v_win from delivery_windows where id = p_window_id for update;  -- trava a janela
  if not found then perform mc_fail('window_not_found','Janela de entrega não encontrada.'); end if;
  select * into v_day from delivery_days where id = v_win.delivery_day_id;
  if v_day.status <> 'open' then perform mc_fail('day_closed','Este sábado não está aberto para agendamento.'); end if;
  if now() >= v_day.cutoff_at then perform mc_fail('cutoff_passed','O prazo para agendar neste sábado já encerrou.'); end if;

  select * into v_addr from addresses
    where id = p_address_id and customer_id = v_uid and archived_at is null;
  if not found then perform mc_fail('address_not_found','Endereço inválido.'); end if;
  if v_addr.area_id <> v_win.area_id then
    perform mc_fail('area_mismatch','O endereço não pertence à região desta janela.');
  end if;

  if exists (select 1 from visits v join delivery_windows w on w.id = v.window_id
              where v.customer_id = v_uid and w.delivery_day_id = v_win.delivery_day_id
                and v.status in ('requested','confirmed','out_for_delivery')) then
    perform mc_fail('already_scheduled','Você já tem uma visita agendada neste sábado.');
  end if;

  select count(*) into v_used from visits
    where window_id = p_window_id and status in ('requested','confirmed','out_for_delivery','done');
  if v_used >= v_win.capacity then
    perform mc_fail('window_full','Esta janela está lotada.');
  end if;

  -- itens de coleta: livros em posse e ainda sem visita aberta
  select array_agg(l.id) into v_collect from loans l
    where l.customer_id = v_uid and l.status in ('active','overdue','return_requested')
      and not exists (select 1 from visit_items vi join visits vv on vv.id = vi.visit_id
                       where vi.loan_id = l.id and vi.direction = 'collect'
                         and vv.status in ('requested','confirmed','out_for_delivery'));
  v_ncollect := coalesce(cardinality(v_collect), 0);
  v_blocked := mc_is_overdue_blocked(v_uid);   -- bloqueado: só coleta, nunca entrega (reserva offered fica intacta)

  -- item de entrega: reserva oferecida com guarda vigente
  select exists (select 1 from subscriptions where customer_id = v_uid and status = 'active') into v_active_sub;
  select * into v_res from reservations
    where customer_id = v_uid and status = 'offered' and hold_expires_at > now()
    order by queued_at limit 1 for update;
  if found and v_active_sub and not v_blocked
     and not exists (select 1 from loans where customer_id = v_uid and status = 'scheduled') then
    v_max := mc_setting_int('max_open_loans');
    if v_max is null then perform mc_fail('config_pending','Configuração max_open_loans pendente.'); end if;
    select count(*) into v_possessed from loans
      where customer_id = v_uid and status in ('active','overdue','return_requested');
    if v_possessed - v_ncollect < v_max then v_deliver := true; end if;
  end if;

  if not v_deliver and v_ncollect = 0 then
    perform mc_fail('nothing_to_do','Não há entrega nem coleta para agendar.');
  end if;

  insert into visits(customer_id, address_id, window_id, status, customer_note)
    values (v_uid, p_address_id, p_window_id, 'requested', p_note) returning * into v_visit;

  if v_ncollect > 0 then
    update loans set status = 'return_requested' where id = any(v_collect);
    insert into visit_items(visit_id, loan_id, direction)
      select v_visit.id, x, 'collect' from unnest(v_collect) x;
  end if;

  if v_deliver then
    insert into loans(customer_id, copy_id, reservation_id, status)
      values (v_uid, v_res.offered_copy_id, v_res.id, 'scheduled') returning * into v_loan;
    update reservations set status = 'fulfilled', closed_at = now() where id = v_res.id;
    insert into visit_items(visit_id, loan_id, direction) values (v_visit.id, v_loan.id, 'deliver');
  end if;

  perform mc_audit('schedule_visit','visits', v_visit.id::text,
                   jsonb_build_object('deliver', v_deliver, 'collect', v_ncollect));
  return v_visit;
end $$;

create or replace function register_return(p_loan_id uuid, p_condition text) returns loans
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_loan loans; v_copy copies; v_was_blocked boolean; v_book uuid; v_cond text := lower(btrim(coalesce(p_condition,'')));
begin
  if not mc_is_staff('admin','ops') then perform mc_fail('forbidden','Sem permissão para registrar devoluções.'); end if;
  if v_cond not in ('good','fair','damaged') then
    perform mc_fail('invalid_condition','Condição inválida (use good, fair ou damaged).');
  end if;

  select c.* into v_copy from loans l join copies c on c.id = l.copy_id where l.id = p_loan_id;
  if not found then perform mc_fail('loan_not_found','Empréstimo não encontrado.'); end if;
  perform 1 from books where id = v_copy.book_id for update;   -- mesma ordem de lock das demais RPCs

  select * into v_loan from loans where id = p_loan_id for update;
  if v_loan.status not in ('active','return_requested','overdue') then
    perform mc_fail('invalid_loan_status','Este empréstimo não pode ser devolvido no status atual.');
  end if;

  v_was_blocked := mc_is_overdue_blocked(v_loan.customer_id);
  update loans set status = 'returned', returned_at = now(), return_condition = v_cond
    where id = p_loan_id returning * into v_loan;
  update copies set status = case when v_cond = 'damaged' then 'damaged'::copy_status else 'available'::copy_status end,
                    condition = v_cond
    where id = v_copy.id;

  perform mc_promote_queue(v_copy.book_id);
  -- bloqueio some sozinho ao devolver o livro em atraso: re-dispara a fila dos livros que o cliente aguarda
  if v_was_blocked and not mc_is_overdue_blocked(v_loan.customer_id) then
    for v_book in select distinct book_id from reservations
                   where customer_id = v_loan.customer_id and status = 'queued' order by book_id loop
      perform mc_promote_queue(v_book);
    end loop;
  end if;
  perform mc_audit('register_return','loans', p_loan_id::text, jsonb_build_object('condition', v_cond));
  return v_loan;
end $$;

-- my_account (frente A, 0021): mesma definição + 2 colunas ao final.
create or replace view public.my_account as
select
  c.id                          as customer_id,
  c.full_name,
  c.email::text                 as email,
  c.whatsapp,

  -- plano / assinatura (a não cancelada; senão a mais recente)
  sub.id                        as subscription_id,
  sub.status                    as subscription_status,
  sub.started_at,
  sub.current_period_end,
  sub.paused_until,
  sub.payment_method,
  (select (s.value #>> '{}')::int from public.settings s where s.key = 'plan_price_cents')
                                as plan_price_cents,

  -- endereço padrão
  ad.id                         as address_id,
  ad.cep,
  ad.street,
  ad.number,
  ad.complement,
  ad.reference,
  ar.name                       as area_name,

  -- livro atual e prazo
  cl.loan_id,
  cl.loan_status,
  cl.book_id                    as loan_book_id,
  cl.title                      as loan_title,
  cl.authors                    as loan_authors,
  cl.delivered_at               as loan_delivered_at,
  cl.due_date                   as loan_due_date,
  case when cl.due_date is not null
       then cl.due_date - (now() at time zone 'America/Sao_Paulo')::date
  end                           as loan_days_left,

  -- posição em cada fila: [{reservation_id, book_id, title, authors, status,
  --   position, queued_at, hold_expires_at}]; position = null quando 'offered'
  coalesce(q.items, '[]'::jsonb) as reservations,

  -- próxima visita (entrega/coleta) ainda não concluída
  nv.visit_id                   as next_visit_id,
  nv.status                     as next_visit_status,
  nv.day                        as next_visit_day,
  nv.starts_at                  as next_visit_starts_at,
  nv.ends_at                    as next_visit_ends_at,
  coalesce(nv.items, '[]'::jsonb) as next_visit_items,

  -- histórico (até 50): [{loan_id, book_id, title, authors, status, delivered_at, returned_at}]
  coalesce(h.items, '[]'::jsonb) as history,

  -- lembretes
  (select s.value from public.settings s where s.key = 'reminder_days_before')
                                as reminder_days_before,
  coalesce(rm.items, '[]'::jsonb) as recent_reminders,

  -- Frente C: bloqueio por atraso (colunas novas SEMPRE ao final)
  public.mc_is_overdue_blocked(c.id) as blocked_by_overdue,
  (select min(l.due_date) from public.loans l
    where l.customer_id = c.id
      and (l.status = 'overdue'
           or (l.status in ('active','return_requested')
               and l.due_date < (now() at time zone 'America/Sao_Paulo')::date))) as overdue_since
from public.customers c
left join lateral (
  select s.*
  from public.subscriptions s
  where s.customer_id = c.id
  order by (s.status <> 'canceled') desc, s.started_at desc nulls last, s.id
  limit 1
) sub on true
left join lateral (
  select a.*
  from public.addresses a
  where a.customer_id = c.id and a.archived_at is null
  order by a.is_default desc, a.id
  limit 1
) ad on true
left join public.served_areas ar on ar.id = ad.area_id
left join lateral (
  select l.id as loan_id, l.status as loan_status, l.delivered_at, l.due_date,
         b.id as book_id, b.title, b.authors
  from public.loans l
  join public.copies cp on cp.id = l.copy_id
  join public.books b on b.id = cp.book_id
  where l.customer_id = c.id
    and l.status in ('scheduled','active','return_requested','overdue')
  order by l.created_at desc
  limit 1
) cl on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
           'reservation_id', r.id,
           'book_id', r.book_id,
           'title', b.title,
           'authors', to_jsonb(b.authors),
           'status', r.status,
           'position', case when r.status = 'queued' then (
               select count(*) from public.reservations r2
               where r2.book_id = r.book_id and r2.status = 'queued'
                 and (r2.queued_at, r2.id) <= (r.queued_at, r.id)
             ) end,
           'queued_at', r.queued_at,
           'hold_expires_at', r.hold_expires_at
         ) order by r.queued_at) as items
  from public.reservations r
  join public.books b on b.id = r.book_id
  where r.customer_id = c.id and r.status in ('queued','offered')
) q on true
left join lateral (
  select v.id as visit_id, v.status, dd.day, dw.starts_at, dw.ends_at,
         (select jsonb_agg(jsonb_build_object(
                   'direction', vi.direction, 'loan_id', vi.loan_id, 'title', vb.title)
                 order by vi.direction)
            from public.visit_items vi
            join public.loans vl on vl.id = vi.loan_id
            join public.copies vc on vc.id = vl.copy_id
            join public.books vb on vb.id = vc.book_id
           where vi.visit_id = v.id) as items
  from public.visits v
  join public.delivery_windows dw on dw.id = v.window_id
  join public.delivery_days dd on dd.id = dw.delivery_day_id
  where v.customer_id = c.id and v.status in ('requested','confirmed','out_for_delivery')
  order by dd.day, dw.starts_at
  limit 1
) nv on true
left join lateral (
  select jsonb_agg(x.j order by x.sort_at desc) as items
  from (
    select jsonb_build_object(
             'loan_id', l.id, 'book_id', b.id, 'title', b.title,
             'authors', to_jsonb(b.authors), 'status', l.status,
             'delivered_at', l.delivered_at, 'returned_at', l.returned_at) as j,
           coalesce(l.returned_at, l.delivered_at, l.created_at) as sort_at
    from public.loans l
    join public.copies cp on cp.id = l.copy_id
    join public.books b on b.id = cp.book_id
    where l.customer_id = c.id and l.status in ('returned','lost')
    order by coalesce(l.returned_at, l.delivered_at, l.created_at) desc
    limit 50
  ) x
) h on true
left join lateral (
  select jsonb_agg(jsonb_build_object('kind', e.kind, 'sent_at', e.sent_at, 'subject', e.subject)
                   order by e.sent_at desc) as items
  from (
    select * from public.email_log el
    where el.customer_id = c.id
    order by el.sent_at desc
    limit 5
  ) e
) rm on true
where c.id = auth.uid();
