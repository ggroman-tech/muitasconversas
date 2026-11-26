-- PROPOSTA 0094 — NÃO APLICADA (testada em rollback)
-- get_advisors/performance: 15 FKs sem índice (joins e deletes em cascata ficam
-- lentos quando o volume crescer). Todos "if not exists". Risco: baixo (tabelas
-- pequenas hoje; criação instantânea).
create index if not exists payments_customer_idx on public.payments (customer_id);
create index if not exists payments_subscription_idx on public.payments (subscription_id);
create index if not exists payments_event_registration_idx on public.payments (event_registration_id);
create index if not exists mp_preapprovals_subscription_idx on public.mp_preapprovals (subscription_id);
create index if not exists email_log_loan_idx on public.email_log (loan_id);
create index if not exists consents_customer_idx on public.consents (customer_id);
create index if not exists reservations_offered_copy_idx on public.reservations (offered_copy_id);
create index if not exists visits_customer_idx on public.visits (customer_id);
create index if not exists visits_address_idx on public.visits (address_id);
create index if not exists addresses_area_idx on public.addresses (area_id);
create index if not exists loans_reservation_idx on public.loans (reservation_id);
create index if not exists visit_items_loan_idx on public.visit_items (loan_id);
create index if not exists event_registrations_customer_idx on public.event_registrations (customer_id);
create index if not exists delivery_windows_area_idx on public.delivery_windows (area_id);
create index if not exists delivery_windows_day_idx on public.delivery_windows (delivery_day_id);
