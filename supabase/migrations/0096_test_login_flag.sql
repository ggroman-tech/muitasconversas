-- Modo teste: login sem e-mail para a conta de teste, só enquanto settings.test_login_until estiver no futuro.
-- Para DESLIGAR: delete from public.settings where key = 'test_login_until';
create or replace function public.test_login_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (s.value #>> '{}')::timestamptz > pg_catalog.now()
    from public.settings s
    where s.key = 'test_login_until'
  ), false);
$$;
revoke all on function public.test_login_enabled() from public;
grant execute on function public.test_login_enabled() to anon, authenticated, service_role;
