-- 0076: classificação do catálogo (planilha da cliente, 22/11/2026).
-- Públicos (filtros): Gênero e Conservação. Internos: Temas, Detalhes e Atenção (só equipe).
-- books é legível por anon, então o que é interno vive em book_internal (RLS só para staff).

create table if not exists tag_vocab (
  tag  text primary key,
  kind text not null check (kind in ('genre','condition','detail','attention'))
);
alter table tag_vocab enable row level security;   -- sem policies: só funções security definer/service_role

insert into tag_vocab(tag, kind) values
  ('Suspense & Mistério','genre'),('Fantasia','genre'),('Ficção Contemporânea','genre'),
  ('Não-Ficção & Ensaios','genre'),('Clássicos','genre'),('Romance','genre'),('Contos & Crônicas','genre'),
  ('Novo','condition'),('Muito bom','condition'),('Bom','condition'),('Médio','condition'),
  ('Capa dura','detail'),('Ilustrado','detail'),
  ('Páginas amareladas','attention'),('Marcas de uso','attention'),('Sinais de umidade','attention')
on conflict (tag) do update set kind = excluded.kind;

alter table books add column if not exists genre text, add column if not exists condition text;

create table if not exists book_internal (
  book_id    uuid primary key references books(id) on delete cascade deferrable initially deferred,
  themes     text[] not null default '{}',
  details    text[] not null default '{}',
  attention  text[] not null default '{}',
  other_tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table book_internal enable row level security;
drop policy if exists book_internal_select_staff on book_internal;
create policy book_internal_select_staff on book_internal for select to authenticated
  using (mc_is_staff('admin'::staff_role, 'ops'::staff_role, 'driver'::staff_role));

-- Separa as tags planas do Libib: gênero e conservação ficam públicos; o resto vai para book_internal.
create or replace function mc_classify_book() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t text; k text; v_tag text; v_det text[] := '{}'; v_att text[] := '{}'; v_oth text[] := '{}';
begin
  new.genre := null; new.condition := null;
  foreach t in array coalesce(new.genres, '{}') loop
    select kind, tag into k, v_tag from tag_vocab where lower(tag) = lower(btrim(t));
    if k = 'genre' then new.genre := coalesce(new.genre, v_tag);
    elsif k = 'condition' then new.condition := coalesce(new.condition, v_tag);
    elsif k = 'detail' then v_det := v_det || v_tag;
    elsif k = 'attention' then v_att := v_att || v_tag;
    elsif t is not null and btrim(t) <> '' then v_oth := v_oth || t;
    end if;
    k := null; v_tag := null;
  end loop;
  new.genres := case when new.genre is null then '{}' else array[new.genre] end;
  insert into book_internal(book_id, details, attention, other_tags)
  values (new.id, v_det, v_att, v_oth)
  on conflict (book_id) do update
    set details = excluded.details, attention = excluded.attention,
        other_tags = excluded.other_tags, updated_at = now();
  return new;
end $$;
revoke all on function mc_classify_book() from public, anon, authenticated;

drop trigger if exists books_classify on books;
create trigger books_classify before insert or update of genres on books
  for each row execute function mc_classify_book();

-- view pública: acrescenta genre e condition no fim (create or replace só aceita colunas novas ao final)
create or replace view catalog_public as
select b.id, b.isbn13, b.title, b.authors, b.publisher, b.published_year, b.genres, b.description,
       b.cover_url, b.search,
       (coalesce(c.available, 0::bigint))::integer as copies_available,
       (coalesce(r.queued, 0::bigint))::integer as queue_size,
       b.genre, b.condition
from books b
left join lateral (
  select count(*) filter (where status = 'available'::copy_status) as available,
         count(*) filter (where status <> 'withdrawn'::copy_status) as active
  from copies where book_id = b.id
) c on true
left join lateral (
  select count(*) as queued from reservations where book_id = b.id and status = 'queued'::reservation_status
) r on true
where c.active > 0;

create or replace view catalog_genres as
select genre, count(*)::int as books from catalog_public where genre is not null group by genre;
create or replace view catalog_conditions as
select condition, count(*)::int as books from catalog_public where condition is not null group by condition;
grant select on catalog_public, catalog_genres, catalog_conditions to anon, authenticated;
