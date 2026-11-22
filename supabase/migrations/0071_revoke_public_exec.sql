-- 0071: funções nascem com EXECUTE para PUBLIC; remove e concede só a quem precisa.
revoke execute on function mc_setting(text), mc_setting_int(text), mc_setting_bool(text),
  mc_staff_role(), mc_is_staff(staff_role[]), mc_today(),
  signup_customer(text,text,text,text,text,text,text,jsonb,text,text), schedule_options(),
  cancel_visit(uuid,text), mark_visit_failed(uuid,text), generate_delivery_days(int),
  immutable_array_to_string(text[], text)
  from public, anon;
grant execute on function mc_setting(text), mc_setting_int(text), mc_setting_bool(text),
  mc_staff_role(), mc_is_staff(staff_role[]), mc_today() to authenticated, service_role;
grant execute on function signup_customer(text,text,text,text,text,text,text,jsonb,text,text), schedule_options(),
  cancel_visit(uuid,text), mark_visit_failed(uuid,text), generate_delivery_days(int) to authenticated, service_role;
grant execute on function immutable_array_to_string(text[], text) to authenticated, service_role, anon;
alter function immutable_array_to_string(text[], text) set search_path = pg_catalog;
