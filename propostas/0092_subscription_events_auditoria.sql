-- PROPOSTA 0092 — NÃO APLICADA (testada em rollback)
-- Trilha de auditoria de assinaturas: cada mudança de status, fim do período,
-- pedido de cancelamento ou vínculo MP vira uma linha. Responde "por que este
-- cliente está past_due/cancelado?" sem depender de log do MP. Risco: baixo (trigger
-- AFTER simples, só INSERT). Só a equipe lê.
create table if not exists public.subscription_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  subscription_id uuid not null,
  customer_id uuid,
  event text not null,
  status_from text, status_to text,
  period_end_from date, period_end_to date,
  cancel_requested boolean,
  mp_preapproval_id text,
  actor text default current_user
);
create index if not exists subscription_events_sub_idx on public.subscription_events (subscription_id, at desc);
alter table public.subscription_events enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subscription_events' and policyname='subscription_events_select_staff') then
    create policy subscription_events_select_staff on public.subscription_events for select to authenticated using ((select mc_is_staff('admin','ops')));
  end if;
end $p$;
revoke all on public.subscription_events from anon, authenticated;
grant select on public.subscription_events to authenticated;

create or replace function public.mc_log_subscription_event() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if tg_op = 'INSERT' then
    insert into subscription_events(subscription_id, customer_id, event, status_to, period_end_to, cancel_requested, mp_preapproval_id)
    values (new.id, new.customer_id, 'created', new.status, new.current_period_end, new.cancel_requested_at is not null, new.mp_preapproval_id);
  elsif new.status is distinct from old.status or new.current_period_end is distinct from old.current_period_end
     or (new.cancel_requested_at is not null) is distinct from (old.cancel_requested_at is not null)
     or new.mp_preapproval_id is distinct from old.mp_preapproval_id then
    insert into subscription_events(subscription_id, customer_id, event, status_from, status_to, period_end_from, period_end_to, cancel_requested, mp_preapproval_id)
    values (new.id, new.customer_id,
      case when new.status is distinct from old.status then 'status_' || new.status
           when (new.cancel_requested_at is not null) is distinct from (old.cancel_requested_at is not null) then case when new.cancel_requested_at is not null then 'cancel_requested' else 'cancel_reverted' end
           when new.mp_preapproval_id is distinct from old.mp_preapproval_id then 'mp_linked'
           else 'period_changed' end,
      old.status, new.status, old.current_period_end, new.current_period_end, new.cancel_requested_at is not null, new.mp_preapproval_id);
  end if;
  return null;
end $f$;
revoke all on function public.mc_log_subscription_event() from public, anon, authenticated;
drop trigger if exists trg_subscription_events on public.subscriptions;
create trigger trg_subscription_events after insert or update on public.subscriptions for each row execute function public.mc_log_subscription_event();
