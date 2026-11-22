-- Frente C — views operacionais. Rodam com o dono (bypass de RLS) e se filtram por staff_members.

-- Rota de sábado: motorista, ops e admin. Mostra visitas abertas de sábados de hoje em diante.
create or replace view saturday_route as
select
  v.id               as visit_id,
  dd.day             as delivery_day,
  dw.starts_at       as window_starts_at,
  dw.ends_at         as window_ends_at,
  sa.name            as area_name,
  v.route_order,
  v.status           as visit_status,
  c.full_name        as customer_name,
  c.whatsapp         as customer_whatsapp,
  a.cep, a.street, a.number, a.complement, a.reference,
  v.customer_note,
  items.items
from visits v
join delivery_windows dw on dw.id = v.window_id
join delivery_days dd    on dd.id = dw.delivery_day_id
join served_areas sa     on sa.id = dw.area_id
join customers c         on c.id = v.customer_id
join addresses a         on a.id = v.address_id
cross join lateral (
  select coalesce(jsonb_agg(jsonb_build_object(
           'direction', vi.direction, 'loan_id', l.id, 'copy_label', cp.label_code, 'title', b.title)
           order by vi.direction), '[]'::jsonb) as items
  from visit_items vi
  join loans l   on l.id = vi.loan_id
  join copies cp on cp.id = l.copy_id
  join books b   on b.id = cp.book_id
  where vi.visit_id = v.id
) items
where mc_is_staff('admin','ops','driver')
  and v.status in ('requested','confirmed','out_for_delivery','done')
  and dd.day >= mc_today()
order by dd.day, dw.starts_at, v.route_order nulls last, v.id;

-- Empréstimos em atraso: ops/admin. Multa NÃO é calculada (decisão pendente): só expõe o valor em settings.
create or replace view overdue_loans as
select
  l.id            as loan_id,
  l.customer_id,
  c.full_name     as customer_name,
  c.email         as customer_email,
  c.whatsapp      as customer_whatsapp,
  b.id            as book_id,
  b.title         as book_title,
  cp.label_code,
  l.due_date,
  (mc_today() - l.due_date) as days_overdue,
  l.status        as loan_status,
  (mc_setting('late_fee_cents')) as late_fee_cents_setting
from loans l
join customers c on c.id = l.customer_id
join copies cp   on cp.id = l.copy_id
join books b     on b.id = cp.book_id
where mc_is_staff('admin','ops')
  and l.due_date < mc_today()
  and l.status in ('active','overdue')
order by l.due_date, l.id;

revoke all on saturday_route, overdue_loans from public, anon;
grant select on saturday_route, overdue_loans to authenticated, service_role;
