-- Frente C — RLS: cliente lê só o próprio; escrita só via RPC (security definer); staff por staff_members.

alter table customers     enable row level security;
alter table addresses     enable row level security;
alter table loans         enable row level security;
alter table reservations  enable row level security;
alter table visits        enable row level security;
alter table visit_items   enable row level security;
alter table payments      enable row level security;
alter table consents      enable row level security;
alter table subscriptions enable row level security;
alter table staff_members enable row level security;
alter table email_log     enable row level security;
alter table audit_log     enable row level security;

-- Cliente: lê o próprio
create policy customers_select_own    on customers     for select to authenticated using (id = (select auth.uid()));
create policy addresses_select_own    on addresses     for select to authenticated using (customer_id = (select auth.uid()));
create policy loans_select_own        on loans         for select to authenticated using (customer_id = (select auth.uid()));
create policy reservations_select_own on reservations  for select to authenticated using (customer_id = (select auth.uid()));
create policy visits_select_own       on visits        for select to authenticated using (customer_id = (select auth.uid()));
create policy visit_items_select_own  on visit_items   for select to authenticated
  using (exists (select 1 from visits v where v.id = visit_id and v.customer_id = (select auth.uid())));
create policy payments_select_own     on payments      for select to authenticated using (customer_id = (select auth.uid()));
create policy consents_select_own     on consents      for select to authenticated using (customer_id = (select auth.uid()));
create policy subscriptions_select_own on subscriptions for select to authenticated using (customer_id = (select auth.uid()));
create policy email_log_select_own    on email_log     for select to authenticated using (customer_id = (select auth.uid()));
create policy staff_members_select_own on staff_members for select to authenticated using (user_id = (select auth.uid()));

-- Staff admin/ops: leitura geral (driver NÃO; driver só vê a view saturday_route)
create policy customers_select_staff    on customers     for select to authenticated using (mc_is_staff('admin','ops'));
create policy addresses_select_staff    on addresses     for select to authenticated using (mc_is_staff('admin','ops'));
create policy loans_select_staff        on loans         for select to authenticated using (mc_is_staff('admin','ops'));
create policy reservations_select_staff on reservations for select to authenticated using (mc_is_staff('admin','ops'));
create policy visits_select_staff       on visits        for select to authenticated using (mc_is_staff('admin','ops'));
create policy visit_items_select_staff  on visit_items  for select to authenticated using (mc_is_staff('admin','ops'));
create policy payments_select_staff     on payments      for select to authenticated using (mc_is_staff('admin','ops'));
create policy consents_select_staff     on consents      for select to authenticated using (mc_is_staff('admin','ops'));
create policy subscriptions_select_staff on subscriptions for select to authenticated using (mc_is_staff('admin','ops'));
create policy email_log_select_staff    on email_log     for select to authenticated using (mc_is_staff('admin','ops'));
create policy audit_log_select_admin    on audit_log     for select to authenticated using (mc_is_staff('admin'));
create policy staff_members_select_admin on staff_members for select to authenticated using (mc_is_staff('admin'));

-- Sem policies de INSERT/UPDATE/DELETE: escrita somente por RPC security definer / service_role (bypassrls).
-- Defesa em profundidade: revoga também os privilégios.
revoke all on customers, addresses, loans, reservations, visits, visit_items, payments, consents,
              subscriptions, staff_members, email_log, audit_log from anon;
revoke insert, update, delete, truncate, references, trigger on
  customers, addresses, loans, reservations, visits, visit_items, payments, consents,
  subscriptions, staff_members, email_log, audit_log,
  copies, delivery_days, delivery_windows, served_areas, settings
  from anon, authenticated;
revoke usage, update on sequence audit_log_id_seq from anon, authenticated;
