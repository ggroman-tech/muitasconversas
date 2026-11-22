-- Frente A (rodada 3) — leitura para a tela /agendar.
-- RLS bloqueia leitura direta de delivery_*; esta função (security definer) devolve só o que
-- pertence ao cliente logado (auth.uid()) mais sábados/janelas abertos (dados não pessoais).
-- Espelha as regras de schedule_visit (0045) só para exibição; a RPC continua sendo a autoridade.
create or replace function public.schedule_options() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := mc_require_customer();
  v_active_sub boolean; v_blocked boolean; v_max int; v_possessed int;
  v_collect jsonb; v_ncollect int; v_offer_title text; v_offer_until timestamptz;
  v_has_offer boolean := false; v_has_scheduled boolean; v_deliver boolean := false;
  v_addresses jsonb; v_days jsonb;
begin
  select exists (select 1 from subscriptions where customer_id = v_uid and status = 'active') into v_active_sub;
  v_blocked := mc_is_overdue_blocked(v_uid);

  select coalesce(jsonb_agg(jsonb_build_object('loan_id', l.id, 'title', b.title, 'due_date', l.due_date,
                                               'status', l.status) order by l.created_at), '[]'::jsonb)
    into v_collect
    from loans l join copies c on c.id = l.copy_id join books b on b.id = c.book_id
   where l.customer_id = v_uid and l.status in ('active','overdue','return_requested')
     and not exists (select 1 from visit_items vi join visits vv on vv.id = vi.visit_id
                      where vi.loan_id = l.id and vi.direction = 'collect'
                        and vv.status in ('requested','confirmed','out_for_delivery'));
  v_ncollect := jsonb_array_length(v_collect);

  select b.title, r.hold_expires_at into v_offer_title, v_offer_until
    from reservations r join books b on b.id = r.book_id
   where r.customer_id = v_uid and r.status = 'offered' and r.hold_expires_at > now()
   order by r.queued_at limit 1;
  v_has_offer := found;

  select exists (select 1 from loans where customer_id = v_uid and status = 'scheduled') into v_has_scheduled;
  if v_has_offer and v_active_sub and not v_blocked and not v_has_scheduled then
    v_max := mc_setting_int('max_open_loans');
    select count(*) into v_possessed from loans
     where customer_id = v_uid and status in ('active','overdue','return_requested');
    v_deliver := v_max is not null and (v_possessed - v_ncollect) < v_max;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'street', a.street, 'number', a.number, 'complement', a.complement,
           'cep', a.cep, 'area_id', a.area_id, 'area_name', ar.name, 'is_default', a.is_default)
         order by a.is_default desc, a.id), '[]'::jsonb)
    into v_addresses
    from addresses a join served_areas ar on ar.id = a.area_id
   where a.customer_id = v_uid and a.archived_at is null;

  select coalesce(jsonb_agg(d.j order by d.day), '[]'::jsonb) into v_days from (
    select dd.day,
      jsonb_build_object(
        'day', dd.day, 'cutoff_at', dd.cutoff_at,
        'already_scheduled', exists (
            select 1 from visits v join delivery_windows w2 on w2.id = v.window_id
             where v.customer_id = v_uid and w2.delivery_day_id = dd.id
               and v.status in ('requested','confirmed','out_for_delivery')),
        'windows', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'window_id', w.id, 'area_id', w.area_id, 'area_name', sa.name,
                   'starts_at', w.starts_at, 'ends_at', w.ends_at,
                   'full', (select count(*) from visits v
                             where v.window_id = w.id and v.status in ('requested','confirmed','out_for_delivery','done'))
                           >= w.capacity)
                 order by sa.name, w.starts_at), '[]'::jsonb)
            from delivery_windows w join served_areas sa on sa.id = w.area_id
           where w.delivery_day_id = dd.id
             and w.area_id in (select area_id from addresses where customer_id = v_uid and archived_at is null))
      ) as j
    from delivery_days dd
    where dd.status = 'open' and now() < dd.cutoff_at
  ) d;

  return jsonb_build_object(
    'has_active_subscription', v_active_sub,
    'blocked_by_overdue', v_blocked,
    'overdue_since', (select min(l.due_date) from loans l
                       where l.customer_id = v_uid
                         and l.status in ('overdue','active','return_requested')
                         and l.due_date < mc_today()),
    'deliver', case when v_deliver then jsonb_build_object('title', v_offer_title, 'hold_expires_at', v_offer_until) end,
    'offer_held_back', v_has_offer and not v_deliver,
    'collect', v_collect,
    'addresses', v_addresses,
    'days', v_days);
end $$;

revoke all on function public.schedule_options() from public, anon;
grant execute on function public.schedule_options() to authenticated;
