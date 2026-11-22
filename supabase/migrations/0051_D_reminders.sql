-- Frente D: lembretes de devolução. "Hoje" = data em America/Sao_Paulo.
-- Dias de antecedência vêm de settings.reminder_days_before (padrão [7,3,1]).
-- O envio grava email_log com o mesmo dedupe_key para não repetir.
create or replace view reminders_due as
with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
days as (
  select (v)::int as n
  from jsonb_array_elements_text(
         coalesce((select value from settings where key = 'reminder_days_before'), '[7,3,1]'::jsonb)) v
)
select l.id                       as loan_id,
       c.email::text              as customer_email,
       c.full_name,
       b.title                    as book_title,
       l.due_date,
       (l.due_date - t.d)         as days_until_due,
       'reminder_d' || dd.n       as kind,
       'reminder_d' || dd.n || ':loan_' || l.id as dedupe_key
from loans l
join today t on true
join days dd on dd.n = (l.due_date - t.d)
join customers c on c.id = l.customer_id and c.anonymized_at is null
join copies cp on cp.id = l.copy_id
join books b on b.id = cp.book_id
where l.status = 'active'
  and not exists (
    select 1 from email_log e
    where e.dedupe_key = 'reminder_d' || dd.n || ':loan_' || l.id);
