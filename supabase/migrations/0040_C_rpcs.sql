-- Frente C — RPCs transacionais de reserva / visita / entrega / devolução
-- Depende de 0001_schema_v1.sql. Regras pendentes (multa, renovação, bloqueio por atraso)
-- NÃO são implementadas: apenas lidas de `settings` quando necessário.

-- ============================================================================
-- 0) Ajuste de índice (ver relatório): 0001 impede a TROCA de sábado, pois
-- 'scheduled' (livro novo) e 'active'/'return_requested' (livro antigo) coexistem
-- até o motorista entregar e a loja registrar a devolução.
-- Mantemos a garantia física: 1 livro em posse (active/overdue) e 1 agendado por assinante.
-- ============================================================================
drop index if exists one_open_loan_per_customer;
create unique index one_possessed_loan_per_customer on loans(customer_id)
  where status in ('active','overdue');
create unique index one_scheduled_loan_per_customer on loans(customer_id)
  where status = 'scheduled';
-- one_open_loan_per_copy (0001) permanece intacto.

-- ============================================================================
-- 1) Helpers (prefixo mc_)
-- ============================================================================
create or replace function mc_today() returns date
language sql stable set search_path = pg_catalog as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function mc_setting(p_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as
$$ select value from settings where key = p_key $$;

create or replace function mc_setting_int(p_key text) returns int
language sql stable security definer set search_path = public, pg_temp as
$$ select (value #>> '{}')::int from settings where key = p_key $$;

create or replace function mc_setting_bool(p_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select (value #>> '{}')::boolean from settings where key = p_key $$;

-- Papel do usuário logado em staff_members (null se não é staff)
create or replace function mc_staff_role() returns staff_role
language sql stable security definer set search_path = public, pg_temp as
$$ select role from staff_members where user_id = auth.uid() $$;

create or replace function mc_is_staff(variadic p_roles staff_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce((select role = any(p_roles) from staff_members where user_id = auth.uid()), false) $$;

-- Erro padronizado: mensagem em pt-BR, código de máquina em DETAIL
create or replace function mc_fail(p_code text, p_msg text) returns void
language plpgsql as
$$ begin raise exception '%', p_msg using errcode = 'P0001', detail = p_code; end $$;

create or replace function mc_audit(p_action text, p_entity text, p_id text, p_diff jsonb default null)
returns void language sql security definer set search_path = public, pg_temp as
$$ insert into audit_log(actor, action, entity, entity_id, diff) values (auth.uid(), p_action, p_entity, p_id, p_diff) $$;

create or replace function mc_require_customer() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then perform mc_fail('not_authenticated','Faça login para continuar.'); end if;
  if not exists (select 1 from customers where id = v_uid and anonymized_at is null) then
    perform mc_fail('customer_not_found','Cadastro de cliente não encontrado.');
  end if;
  return v_uid;
end $$;

-- Operações de manutenção: staff admin/ops, ou chamada sem usuário (service_role / cron)
create or replace function mc_require_ops_or_service() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not mc_is_staff('admin','ops') then
    perform mc_fail('forbidden','Sem permissão para esta operação.');
  end if;
end $$;

-- Promove a fila FIFO: para cada exemplar 'available' do livro, oferece ao primeiro
-- 'queued' (com assinatura ativa). Chamador deve ter feito lock em books(id) OU
-- esta função o faz (lock reentrante na mesma transação).
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

-- ============================================================================
-- 2) reserve_book
-- ============================================================================
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

-- ============================================================================
-- 3) schedule_visit  (troca de sábado: coleta do livro atual + entrega do reservado)
-- ============================================================================
create or replace function schedule_visit(p_window_id int, p_address_id uuid, p_note text default null)
returns visits language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := mc_require_customer();
  v_win delivery_windows; v_day delivery_days; v_addr addresses;
  v_used int; v_visit visits; v_res reservations; v_loan loans;
  v_collect uuid[]; v_ncollect int; v_possessed int; v_max int;
  v_active_sub boolean; v_deliver boolean := false;
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

  -- item de entrega: reserva oferecida com guarda vigente
  select exists (select 1 from subscriptions where customer_id = v_uid and status = 'active') into v_active_sub;
  select * into v_res from reservations
    where customer_id = v_uid and status = 'offered' and hold_expires_at > now()
    order by queued_at limit 1 for update;
  if found and v_active_sub
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

-- ============================================================================
-- 4) confirm_delivery (staff/driver)
-- ============================================================================
create or replace function confirm_delivery(p_visit_id uuid) returns visits
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_visit visits; v_days int; v_loan loans; v_n int;
begin
  if mc_staff_role() is null then perform mc_fail('forbidden','Sem permissão para confirmar entregas.'); end if;

  select * into v_visit from visits where id = p_visit_id for update;
  if not found then perform mc_fail('visit_not_found','Visita não encontrada.'); end if;
  if v_visit.status not in ('requested','confirmed','out_for_delivery') then
    perform mc_fail('invalid_visit_status','Esta visita não pode ser confirmada no status atual.');
  end if;

  for v_loan in
    select l.* from visit_items vi join loans l on l.id = vi.loan_id
     where vi.visit_id = p_visit_id and vi.direction = 'deliver' for update of l
  loop
    if v_loan.status <> 'scheduled' then
      perform mc_fail('invalid_loan_status','Empréstimo não está agendado.');
    end if;
    v_days := mc_setting_int('loan_days');
    if v_days is null then perform mc_fail('config_pending','Configuração loan_days pendente.'); end if;
    update loans set status = 'active', delivered_at = now(), due_date = mc_today() + v_days
      where id = v_loan.id;
    update copies set status = 'on_loan' where id = v_loan.copy_id and status = 'held';
    get diagnostics v_n = row_count;
    if v_n = 0 then perform mc_fail('copy_not_held','Exemplar não está reservado para esta entrega.'); end if;
  end loop;

  update visits set status = 'done', completed_at = now() where id = p_visit_id returning * into v_visit;
  perform mc_audit('confirm_delivery','visits', p_visit_id::text);
  return v_visit;
end $$;

-- ============================================================================
-- 5) register_return (staff admin/ops)
-- p_condition: 'good' | 'fair' -> exemplar 'available'; 'damaged' -> exemplar 'damaged'
-- ============================================================================
create or replace function register_return(p_loan_id uuid, p_condition text) returns loans
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_loan loans; v_copy copies; v_cond text := lower(btrim(coalesce(p_condition,'')));
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

  update loans set status = 'returned', returned_at = now(), return_condition = v_cond
    where id = p_loan_id returning * into v_loan;
  update copies set status = case when v_cond = 'damaged' then 'damaged'::copy_status else 'available'::copy_status end,
                    condition = v_cond
    where id = v_copy.id;

  perform mc_promote_queue(v_copy.book_id);
  perform mc_audit('register_return','loans', p_loan_id::text, jsonb_build_object('condition', v_cond));
  return v_loan;
end $$;

-- ============================================================================
-- 6) expire_holds / mark_overdue  (cron/service_role ou staff admin/ops)
-- ============================================================================
create or replace function expire_holds() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book uuid; v_total int := 0; v_n int; v_copies uuid[];
begin
  perform mc_require_ops_or_service();
  for v_book in
    select distinct book_id from reservations where status = 'offered' and hold_expires_at <= now()
  loop
    perform 1 from books where id = v_book for update;
    with ex as (
      update reservations set status = 'expired', closed_at = now()
       where book_id = v_book and status = 'offered' and hold_expires_at <= now()
       returning offered_copy_id)
    select array_agg(offered_copy_id), count(*) into v_copies, v_n from ex;
    update copies set status = 'available' where id = any(v_copies) and status = 'held';
    v_total := v_total + v_n;
    perform mc_promote_queue(v_book);
  end loop;
  if v_total > 0 then perform mc_audit('expire_holds','reservations', null, jsonb_build_object('expired', v_total)); end if;
  return v_total;
end $$;

-- Apenas muda o status. Multa/bloqueio por atraso: decisão PENDENTE (settings.late_fee_cents), não aplicada aqui.
create or replace function mark_overdue() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  perform mc_require_ops_or_service();
  update loans set status = 'overdue' where status = 'active' and due_date < mc_today();
  get diagnostics v_n = row_count;
  if v_n > 0 then perform mc_audit('mark_overdue','loans', null, jsonb_build_object('count', v_n)); end if;
  return v_n;
end $$;

-- ============================================================================
-- 7) Permissões de execução
-- ============================================================================
revoke all on function reserve_book(uuid), schedule_visit(int, uuid, text), confirm_delivery(uuid),
  register_return(uuid, text), expire_holds(), mark_overdue(), mc_promote_queue(uuid),
  mc_require_customer(), mc_require_ops_or_service(), mc_audit(text,text,text,jsonb), mc_fail(text,text)
  from public, anon, authenticated;
grant execute on function reserve_book(uuid), schedule_visit(int, uuid, text), confirm_delivery(uuid),
  register_return(uuid, text), expire_holds(), mark_overdue() to authenticated, service_role;
grant execute on function mc_promote_queue(uuid) to service_role;
-- helpers de leitura usados por policies/views precisam ser executáveis por quem consulta
grant execute on function mc_today(), mc_setting(text), mc_setting_int(text), mc_setting_bool(text),
  mc_staff_role(), mc_is_staff(staff_role[]) to anon, authenticated, service_role;
