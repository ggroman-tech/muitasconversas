-- Frente E — leituras do painel interno. Mesmo padrão de 0042: views com o dono (bypass de RLS)
-- que se filtram por mc_is_staff(). Nenhuma policy/RLS foi aberta.
-- Depende de 0040 (helpers) e 0042 (saturday_route / overdue_loans).

-- Situação atual dos empréstimos dos itens da rota (saturday_route não traz o status do loan).
-- Permite esconder "Registrar devolução" quando o livro já voltou. admin/ops/driver.
create or replace view painel_route_loans as
select vi.visit_id, vi.loan_id, vi.direction, l.status as loan_status
from visit_items vi
join loans l  on l.id = vi.loan_id
join visits v on v.id = vi.visit_id
join delivery_windows dw on dw.id = v.window_id
join delivery_days dd    on dd.id = dw.delivery_day_id
where mc_is_staff('admin','ops','driver')
  and dd.day >= mc_today();

-- Próximos sábados abertos com cutoff e quantidade de visitas ativas (canceladas/falhas não contam). admin/ops.
create or replace view painel_saturdays as
select dd.id as delivery_day_id, dd.day, dd.cutoff_at, dd.status, (now() >= dd.cutoff_at) as cutoff_passed,
       (select count(*) from delivery_windows w where w.delivery_day_id = dd.id)::int as windows_count,
       (select count(*) from visits v join delivery_windows w on w.id = v.window_id
         where w.delivery_day_id = dd.id
           and v.status in ('requested','confirmed','out_for_delivery','done'))::int as visits_count
from delivery_days dd
where mc_is_staff('admin','ops')
  and dd.status = 'open'
  and dd.day >= mc_today()
order by dd.day;

-- Reservas aguardando (fila e ofertas com guarda vigente), com contato. admin/ops.
create or replace view painel_reservations_waiting as
select r.id as reservation_id, r.status as reservation_status, r.queued_at, r.hold_expires_at,
       b.id as book_id, b.title as book_title,
       c.id as customer_id, c.full_name as customer_name, c.email as customer_email, c.whatsapp as customer_whatsapp,
       case when r.status = 'queued'
            then row_number() over (partition by r.book_id, r.status order by r.queued_at, r.id)::int end as queue_position
from reservations r
join books b     on b.id = r.book_id
join customers c on c.id = r.customer_id
where mc_is_staff('admin','ops')
  and r.status in ('queued','offered')
order by b.title, r.status desc, r.queued_at, r.id;

revoke all on painel_route_loans, painel_saturdays, painel_reservations_waiting from public, anon;
grant select on painel_route_loans, painel_saturdays, painel_reservations_waiting to authenticated, service_role;
