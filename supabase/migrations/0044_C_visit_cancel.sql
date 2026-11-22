-- Frente C — cancelamento de visita e falha de entrega.
-- Depende de 0040 (helpers mc_*) e 0043 (loan_status 'canceled').

-- Desfaz os itens de uma visita e fecha a visita com p_new_status ('canceled' | 'failed').
--  coleta : loan 'return_requested' -> 'active'
--  entrega: loan 'scheduled' -> 'canceled'; reserva 'fulfilled' ->
--     p_fresh_hold = true : 'offered' com NOVA guarda (now()+hold_hours), cópia segue 'held'
--     p_fresh_hold = false: 'offered' se a guarda original ainda vale; senão a cópia é liberada
--                           e a reserva volta a 'queued' com o queued_at original
-- Depois promove a fila dos livros liberados.
create or replace function mc_unwind_visit(p_visit_id uuid, p_new_status visit_status, p_fresh_hold boolean, p_reason text)
returns visits language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_visit visits; v_item record; v_res reservations; v_hours int;
  v_books uuid[] := '{}'; v_book uuid;
begin
  for v_item in
    select vi.direction, l.id as loan_id, l.status as loan_status, l.copy_id, l.reservation_id
      from visit_items vi join loans l on l.id = vi.loan_id
     where vi.visit_id = p_visit_id
     order by vi.direction for update of l
  loop
    if v_item.direction = 'collect' then
      if v_item.loan_status = 'return_requested' then
        update loans set status = 'active' where id = v_item.loan_id;
      end if;
    else
      if v_item.loan_status <> 'scheduled' then
        perform mc_fail('invalid_loan_status','Empréstimo da entrega não está agendado.');
      end if;
      update loans set status = 'canceled' where id = v_item.loan_id;
      select * into v_res from reservations where id = v_item.reservation_id for update;
      if found and v_res.status = 'fulfilled' then
        if p_fresh_hold then
          v_hours := mc_setting_int('hold_hours');
          if v_hours is null then perform mc_fail('config_pending','Configuração hold_hours pendente.'); end if;
          update reservations set status = 'offered', closed_at = null,
                 hold_expires_at = now() + make_interval(hours => v_hours) where id = v_res.id;
        elsif v_res.hold_expires_at > now() then
          update reservations set status = 'offered', closed_at = null where id = v_res.id;
        else
          update copies set status = 'available' where id = v_item.copy_id and status = 'held';
          update reservations set status = 'queued', offered_copy_id = null,
                 hold_expires_at = null, closed_at = null where id = v_res.id;   -- queued_at original
          v_books := v_books || v_res.book_id;
        end if;
      end if;
    end if;
  end loop;

  update visits set status = p_new_status,
         completed_at = case when p_new_status = 'failed' then now() else completed_at end
   where id = p_visit_id returning * into v_visit;

  for v_book in select distinct x from unnest(v_books) x order by x loop
    perform mc_promote_queue(v_book);
  end loop;

  perform mc_audit(case p_new_status when 'failed' then 'mark_visit_failed' else 'cancel_visit' end,
                   'visits', p_visit_id::text, jsonb_build_object('reason', p_reason));
  return v_visit;
end $$;

create or replace function cancel_visit(p_visit_id uuid, p_reason text default null) returns visits
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_visit visits; v_cutoff timestamptz; v_ops boolean;
begin
  if v_uid is null then perform mc_fail('not_authenticated','Faça login para continuar.'); end if;
  v_ops := mc_is_staff('admin','ops');

  select * into v_visit from visits where id = p_visit_id for update;
  if not found or (v_visit.customer_id <> v_uid and not v_ops) then
    perform mc_fail('visit_not_found','Visita não encontrada.');
  end if;
  if v_visit.status not in ('requested','confirmed') then
    perform mc_fail('invalid_visit_status','Esta visita não pode mais ser cancelada.');
  end if;

  if not v_ops then
    select dd.cutoff_at into v_cutoff from delivery_windows dw
      join delivery_days dd on dd.id = dw.delivery_day_id where dw.id = v_visit.window_id;
    if now() >= v_cutoff then
      perform mc_fail('cutoff_passed','O prazo para cancelar esta visita já encerrou. Fale com a equipe.');
    end if;
  end if;

  return mc_unwind_visit(p_visit_id, 'canceled', false, p_reason);
end $$;

create or replace function mark_visit_failed(p_visit_id uuid, p_reason text default null) returns visits
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_visit visits;
begin
  if mc_staff_role() is null then perform mc_fail('forbidden','Sem permissão para registrar falha de entrega.'); end if;
  select * into v_visit from visits where id = p_visit_id for update;
  if not found then perform mc_fail('visit_not_found','Visita não encontrada.'); end if;
  if v_visit.status not in ('requested','confirmed','out_for_delivery') then
    perform mc_fail('invalid_visit_status','Esta visita não pode ser marcada como falha no status atual.');
  end if;
  return mc_unwind_visit(p_visit_id, 'failed', true, p_reason);
end $$;

revoke all on function mc_unwind_visit(uuid, visit_status, boolean, text), cancel_visit(uuid, text), mark_visit_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function cancel_visit(uuid, text), mark_visit_failed(uuid, text) to authenticated, service_role;
-- Capacidade: schedule_visit conta só requested/confirmed/out_for_delivery/done; canceled e failed liberam a vaga.
-- saturday_route já filtra por esses mesmos status; RLS inalterada.
