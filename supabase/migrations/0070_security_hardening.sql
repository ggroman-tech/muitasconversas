-- 0070: endurecimento de segurança aplicado no Supabase (advisors).
-- 1) RLS em todas as tabelas do schema public que ficaram abertas
alter table books               enable row level security;
alter table copies              enable row level security;
alter table settings            enable row level security;
alter table events              enable row level security;
alter table event_registrations enable row level security;
alter table catalog_imports     enable row level security;
alter table delivery_days       enable row level security;
alter table delivery_windows    enable row level security;
alter table served_areas        enable row level security;

-- Leitura pública apenas do que já é público (vitrine e bairros atendidos)
create policy books_select_public        on books        for select to anon, authenticated using (true);
create policy events_select_public       on events       for select to anon, authenticated using (true);
create policy served_areas_select_public on served_areas for select to anon, authenticated using (active);

-- Escrita e leitura interna: só via RPC security definer / service_role
revoke insert, update, delete, truncate, references, trigger on books, events from anon, authenticated;
revoke all on copies, settings, event_registrations, catalog_imports, delivery_days, delivery_windows, catalog_staging
  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on served_areas from anon, authenticated;

-- Views: só leitura (remove DML herdado dos privilégios padrão do Supabase)
revoke insert, update, delete, truncate, references, trigger on
  my_account, catalog_public, catalog_genres, saturday_route, overdue_loans,
  painel_route_loans, painel_saturdays, painel_reservations_waiting
  from anon, authenticated;

-- 2) Funções: tira o acesso anônimo do que não precisa
revoke execute on function signup_customer(text,text,text,text,text,text,text,jsonb,text,text) from anon;
revoke execute on function mc_setting(text), mc_setting_int(text), mc_setting_bool(text),
  mc_staff_role(), mc_is_staff(staff_role[]) from anon;
revoke execute on function mc_is_overdue_blocked(uuid) from anon, authenticated;
revoke execute on function mc_today() from anon;

-- 3) search_path fixo
alter function mc_fail(text, text) set search_path = '';
