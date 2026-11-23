-- 0082: a 0071 revogou EXECUTE de PUBLIC em mc_is_overdue_blocked; a view my_account a chama e "Minha conta"
-- passou a falhar para o assinante logado. Libera para authenticated, só para o próprio cliente ou a equipe. Já aplicada.
create or replace function mc_is_overdue_blocked(p_customer uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when auth.uid() is not null and p_customer is distinct from auth.uid()
         and not mc_is_staff('admin'::staff_role, 'ops'::staff_role, 'driver'::staff_role) then false
    else coalesce(mc_setting_bool('overdue_block_enabled'), false)
     and exists (
       select 1 from loans l
        where l.customer_id = p_customer
          and l.status in ('overdue','active','return_requested')
          and l.due_date < mc_today() - coalesce(mc_setting_int('overdue_block_grace_days'), 0))
  end
$$;
revoke all on function mc_is_overdue_blocked(uuid) from public, anon;
grant execute on function mc_is_overdue_blocked(uuid) to authenticated, service_role;
