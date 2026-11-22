-- Frente A — cadastro do assinante.
-- Cria: settings.consent_version, check_service_area(), signup_config(), signup_customer().
-- Depende de: 0001_schema_v1.sql. Não toca em RLS (frente C).
-- Não integra Pagar.me: a assinatura nasce 'pending' e a frente D a ativa via webhook.

insert into public.settings(key, value) values
  ('consent_version', '"2026-11-21-v1"')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Normaliza CEP: só dígitos; devolve null se não tiver 8 dígitos.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_cep(p_cep text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(pg_catalog.regexp_replace(coalesce(p_cep, ''), '\D', '', 'g')) = 8
      then pg_catalog.regexp_replace(p_cep, '\D', '', 'g')
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Área atendida para um CEP (prefixos em served_areas.cep_prefixes, só dígitos).
-- Devolve linha vazia se fora da área ou CEP inválido. Aberta a anon para o
-- formulário avisar cedo; expõe apenas id e nome da área.
-- ---------------------------------------------------------------------------
create or replace function public.check_service_area(p_cep text)
returns table (area_id int, area_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name
  from public.served_areas a
  where a.active
    and public.normalize_cep(p_cep) is not null
    and exists (
      select 1
      from pg_catalog.unnest(a.cep_prefixes) as p(prefix)
      where pg_catalog.regexp_replace(p.prefix, '\D', '', 'g') <> ''
        and public.normalize_cep(p_cep)
            like pg_catalog.regexp_replace(p.prefix, '\D', '', 'g') || '%'
    )
  order by a.id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Configuração pública do cadastro, vinda de settings (nada fixo no código).
-- ---------------------------------------------------------------------------
create or replace function public.signup_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'consent_version',       (select s.value #>> '{}' from public.settings s where s.key = 'consent_version'),
    'plan_price_cents',      (select s.value from public.settings s where s.key = 'plan_price_cents'),
    'max_open_loans',        (select s.value from public.settings s where s.key = 'max_open_loans'),
    'loan_days',             (select s.value from public.settings s where s.key = 'loan_days'),
    'renewal_allowed',       (select s.value from public.settings s where s.key = 'renewal_allowed'),
    'late_fee_cents',        (select s.value from public.settings s where s.key = 'late_fee_cents'),
    'hold_hours',            (select s.value from public.settings s where s.key = 'hold_hours')
  )
$$;

-- ---------------------------------------------------------------------------
-- signup_customer: cria customer + address + consents + subscription 'pending'
-- numa única transação, para o usuário autenticado (auth.uid()).
--
-- p_consents: objeto jsonb {"privacy_policy": true, "service_rules": true,
--   "marketing_email": false}. Obrigatórios (granted = true): privacy_policy e
--   service_rules. A versão gravada é sempre settings.consent_version; se o
--   formulário enviou outra (p_consent_version), rejeita para não registrar
--   aceite de texto desatualizado.
--
-- Erros (message = código estável; o app traduz):
--   signup:not_authenticated | signup:already_customer | signup:invalid_name |
--   signup:invalid_whatsapp | signup:invalid_cep | signup:out_of_area |
--   signup:invalid_address | signup:consent_required | signup:consent_version
-- ---------------------------------------------------------------------------
create or replace function public.signup_customer(
  p_full_name       text,
  p_whatsapp        text,
  p_cep             text,
  p_street          text,
  p_number          text,
  p_complement      text,
  p_reference       text,
  p_consents        jsonb,
  p_consent_version text,
  p_source          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_name       text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_whatsapp   text;
  v_cep        text := public.normalize_cep(p_cep);
  v_street     text := pg_catalog.btrim(coalesce(p_street, ''));
  v_number     text := pg_catalog.btrim(coalesce(p_number, ''));
  v_area_id    int;
  v_version    text;
  v_purpose    text;
  v_granted    jsonb;
  v_address_id uuid;
  v_sub_id     uuid;
  c_allowed    constant text[] := array['privacy_policy','service_rules','marketing_email'];
  c_required   constant text[] := array['privacy_policy','service_rules'];
begin
  if v_uid is null then
    raise exception 'signup:not_authenticated' using errcode = 'P0001';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'signup:not_authenticated' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.customers c where c.id = v_uid) then
    raise exception 'signup:already_customer' using errcode = 'P0001';
  end if;

  if pg_catalog.length(v_name) < 3 or pg_catalog.length(v_name) > 120 then
    raise exception 'signup:invalid_name' using errcode = 'P0001';
  end if;

  -- WhatsApp opcional: só dígitos, 10 a 13 (DDD + número, com ou sem 55).
  if p_whatsapp is not null and pg_catalog.btrim(p_whatsapp) <> '' then
    v_whatsapp := pg_catalog.regexp_replace(p_whatsapp, '\D', '', 'g');
    if pg_catalog.length(v_whatsapp) not between 10 and 13 then
      raise exception 'signup:invalid_whatsapp' using errcode = 'P0001';
    end if;
  end if;

  if v_cep is null then
    raise exception 'signup:invalid_cep' using errcode = 'P0001';
  end if;

  select a.area_id into v_area_id from public.check_service_area(v_cep) a;
  if v_area_id is null then
    raise exception 'signup:out_of_area' using errcode = 'P0001';
  end if;

  if pg_catalog.length(v_street) < 2 or pg_catalog.length(v_street) > 200
     or pg_catalog.length(v_number) < 1 or pg_catalog.length(v_number) > 20 then
    raise exception 'signup:invalid_address' using errcode = 'P0001';
  end if;

  -- consentimentos
  select s.value #>> '{}' into v_version from public.settings s where s.key = 'consent_version';
  if v_version is null or p_consent_version is distinct from v_version then
    raise exception 'signup:consent_version' using errcode = 'P0001';
  end if;

  if p_consents is null or pg_catalog.jsonb_typeof(p_consents) <> 'object' then
    raise exception 'signup:consent_required' using errcode = 'P0001';
  end if;

  foreach v_purpose in array c_required loop
    if (p_consents -> v_purpose) is distinct from 'true'::jsonb then
      raise exception 'signup:consent_required' using errcode = 'P0001';
    end if;
  end loop;

  begin
    insert into public.customers (id, full_name, email, whatsapp, source)
    values (v_uid, v_name, v_email, v_whatsapp, nullif(pg_catalog.btrim(coalesce(p_source, '')), ''));
  exception when unique_violation then
    raise exception 'signup:already_customer' using errcode = 'P0001';
  end;

  insert into public.addresses (customer_id, area_id, cep, street, number, complement, reference, is_default)
  values (
    v_uid, v_area_id, v_cep, v_street, v_number,
    nullif(pg_catalog.btrim(coalesce(p_complement, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_reference, '')), ''),
    true
  )
  returning id into v_address_id;

  -- uma linha por finalidade conhecida (granted true/false), na versão vigente
  foreach v_purpose in array c_allowed loop
    v_granted := p_consents -> v_purpose;
    if v_purpose = any (c_required) or v_granted is not null then
      insert into public.consents (customer_id, purpose, version, granted)
      values (v_uid, v_purpose, v_version, v_granted is not distinct from 'true'::jsonb);
    end if;
  end loop;

  begin
    insert into public.subscriptions (customer_id, status)
    values (v_uid, 'pending')
    returning id into v_sub_id;
  exception when unique_violation then
    raise exception 'signup:already_customer' using errcode = 'P0001';
  end;

  -- PONTO DE EXTENSÃO (frente D): esta função NÃO grava customers.pagarme_customer_id
  -- nem subscriptions.pagarme_subscription_id. Depois do retorno, o backend da
  -- frente D cria o cliente/cobrança no Pagar.me a partir de subscription_id e
  -- preenche esses dois campos; o webhook então muda status para 'active'.
  -- (No app: lib/auth/billing.ts, startBilling.) Nenhum CPF/documento é coletado.

  return pg_catalog.jsonb_build_object(
    'customer_id',     v_uid,
    'address_id',      v_address_id,
    'area_id',         v_area_id,
    'subscription_id', v_sub_id,
    'status',          'pending'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.normalize_cep(text) from public;
revoke all on function public.check_service_area(text) from public;
revoke all on function public.signup_config() from public;
revoke all on function public.signup_customer(text,text,text,text,text,text,text,jsonb,text,text) from public;

grant execute on function public.normalize_cep(text) to anon, authenticated;
grant execute on function public.check_service_area(text) to anon, authenticated;
grant execute on function public.signup_config() to anon, authenticated;
grant execute on function public.signup_customer(text,text,text,text,text,text,text,jsonb,text,text) to authenticated;
