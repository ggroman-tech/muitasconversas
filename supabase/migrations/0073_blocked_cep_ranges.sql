-- Faixas de CEP NÃO atendidas (comunidades). Uso interno: não é exibida no site.
create table if not exists blocked_cep_ranges (
  id       serial primary key,
  cep_from text not null check (cep_from ~ '^[0-9]{8}$'),
  cep_to   text not null check (cep_to   ~ '^[0-9]{8}$'),
  label    text not null,
  check (cep_from <= cep_to)
);
alter table blocked_cep_ranges enable row level security;
revoke all on blocked_cep_ranges from anon, authenticated;
revoke all on sequence blocked_cep_ranges_id_seq from anon, authenticated;

insert into blocked_cep_ranges(cep_from, cep_to, label) values
  ('22451264','22451730','Rocinha (inclui trecho da Estrada da Gávea que atravessa a comunidade)'),
  ('22450220','22450999','Vidigal (Av. Niemeyer, Estrada do Vidigal, Av. Pres. João Goulart)'),
  ('22452000','22452999','Vidigal (ruas internas)'),
  ('22260152','22260157','Dona Marta (Santa Marta)'),
  ('22031111','22031120','Cabritos e Tabajaras (lado Copacabana)'),
  ('22281131','22281140','Tabajaras (lado Botafogo)'),
  ('22071060','22071079','Pavão-Pavãozinho e Cantagalo'),
  ('22010062','22010070','Chapéu Mangueira e Babilônia');

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
    and not exists (
      select 1 from public.blocked_cep_ranges b
      where public.normalize_cep(p_cep) between b.cep_from and b.cep_to
    )
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

-- Nomes das áreas sem citar comunidades.
update served_areas set name = 'Lagoa, Jardim Botânico e Gávea' where name = 'Lagoa, Jardim Botânico, Gávea e Vidigal';
update served_areas set name = 'São Conrado' where name = 'São Conrado e Rocinha';
