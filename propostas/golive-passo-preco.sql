-- Go-live, passo 3: preço do plano exibido no site = R$ 45,00 (4500 centavos).
-- RODAR SOMENTE DEPOIS de mercadopago-create-plan ter criado o plano real (amount 45, allow_production true).
-- Guarda: recusa se settings.mp_plan_id ainda for um plano antigo (teste a8e6917d... ou o de R$ 1 138ede94...).
do $$
declare v_plan text;
begin
  select value #>> '{}' into v_plan from public.settings where key = 'mp_plan_id';
  if v_plan is null or v_plan in ('a8e6917d299d453994f630981242ff29', '138ede94c3c24d59b529baf9ff7c3e8a') then
    raise exception 'golive: mp_plan_id ainda e um plano antigo (%). Rode create-plan com o token de producao primeiro.', v_plan;
  end if;
  update public.settings set value = to_jsonb(4500), updated_at = now() where key = 'plan_price_cents';
  if not found then raise exception 'golive: setting plan_price_cents nao existe'; end if;
end $$;
