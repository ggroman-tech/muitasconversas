-- Frente A — view my_account: uma linha por assinante logado (auth.uid()).
-- A view roda com os privilégios do dono (sem security_invoker) e filtra por
-- auth.uid(); portanto não depende das políticas RLS da frente C e nunca
-- devolve dados de outro cliente. Sem login => zero linhas.
-- Datas de prazo em America/Sao_Paulo.

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
  coalesce(rm.items, '[]'::jsonb) as recent_reminders
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

revoke all on public.my_account from public, anon;
grant select on public.my_account to authenticated;
