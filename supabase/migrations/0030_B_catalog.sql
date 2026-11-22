-- Frente B — catálogo: staging de importação Libib, view pública e import_catalog().
-- Libib é só fonte: nunca escrevemos de volta e nunca apagamos exemplar (vira 'withdrawn').

-- ===== staging =====
create table if not exists catalog_staging (
  id             bigserial primary key,
  batch_id       uuid not null,
  libib_ref      text,           -- chave estável do item no Libib (ou derivada pelo script)
  isbn13         text,
  title          text not null,
  authors        text[] not null default '{}',
  publisher      text,
  published_year int,
  genres         text[] not null default '{}',
  description    text,
  cover_url      text,
  copies         int not null default 1 check (copies >= 0),
  raw            jsonb,
  created_at     timestamptz not null default now(),
  check (libib_ref is not null or isbn13 is not null)
);
create index if not exists catalog_staging_batch_idx on catalog_staging(batch_id);
alter table catalog_staging enable row level security;  -- sem policies: só service_role/owner

-- ===== sequência de etiquetas dos exemplares =====
create sequence if not exists copy_label_seq;

-- ===== view pública (leitura anônima) =====
-- Roda com os privilégios do dono (não security_invoker) para expor apenas contagens
-- de exemplares/fila, sem abrir copies/reservations para anon.
create or replace view catalog_public as
select
  b.id,
  b.isbn13,
  b.title,
  b.authors,
  b.publisher,
  b.published_year,
  b.genres,
  b.description,
  b.cover_url,
  b.search,
  coalesce(c.available, 0)::int as copies_available,
  coalesce(r.queued, 0)::int    as queue_size
from books b
left join lateral (
  select count(*) filter (where status = 'available') as available,
         count(*) filter (where status <> 'withdrawn') as active
  from copies where book_id = b.id
) c on true
left join lateral (
  select count(*) as queued from reservations where book_id = b.id and status = 'queued'
) r on true
where c.active > 0;   -- livros só com exemplares retirados somem da vitrine (mas continuam no banco)

create or replace view catalog_genres as
select g as genre, count(*)::int as books
from catalog_public, unnest(genres) as g
group by g;

grant select on catalog_public, catalog_genres to anon, authenticated;

-- ===== import_catalog =====
create or replace function import_catalog(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int; v_new int := 0; v_changed int := 0; v_missing int := 0;
  v_copies_new int := 0; v_copies_withdrawn int := 0; v_copies_reactivated int := 0;
  v_import_id uuid; v_n int;
  r record; v_book_id uuid; v_existing books%rowtype; v_key text;
  k int; v_ref text; v_copy copies%rowtype;
  v_seen uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  select count(*) into v_total from catalog_staging where batch_id = p_batch_id;
  if v_total = 0 then
    -- proteção: lote vazio nunca pode "retirar" o acervo inteiro
    raise exception 'import_catalog: lote % vazio ou inexistente', p_batch_id;
  end if;

  -- uma linha por livro (última do lote vence; copies somadas quando o CSV repete o livro)
  for r in
    select distinct on (coalesce(libib_ref, isbn13))
           coalesce(libib_ref, isbn13) as k,
           libib_ref, isbn13, title, authors, publisher, published_year, genres,
           description, cover_url,
           sum(copies) over (partition by coalesce(libib_ref, isbn13)) as copies
    from catalog_staging
    where batch_id = p_batch_id
    order by coalesce(libib_ref, isbn13), id desc
  loop
    v_key := r.k;
    v_book_id := null;

    -- casa por libib_ref e, na falta, por isbn13
    if r.libib_ref is not null then
      select * into v_existing from books where libib_ref = r.libib_ref;
    end if;
    if v_existing.id is null and r.isbn13 is not null then
      select * into v_existing from books where isbn13 = r.isbn13;
    end if;

    if v_existing.id is null then
      insert into books(isbn13, title, authors, publisher, published_year, genres, description, cover_url, libib_ref)
      values (r.isbn13, r.title, r.authors, r.publisher, r.published_year, r.genres, r.description, r.cover_url,
              coalesce(r.libib_ref, r.isbn13))
      returning id into v_book_id;
      v_new := v_new + 1;
    else
      v_book_id := v_existing.id;
      if (v_existing.title, v_existing.authors, v_existing.publisher, v_existing.published_year,
          v_existing.genres, v_existing.description, v_existing.cover_url)
         is distinct from
         (r.title, r.authors, r.publisher, r.published_year, r.genres,
          coalesce(r.description, v_existing.description), coalesce(r.cover_url, v_existing.cover_url))
         or (v_existing.isbn13 is null and r.isbn13 is not null
             and not exists (select 1 from books where isbn13 = r.isbn13 and id <> v_existing.id))
         or (v_existing.libib_ref is null and r.libib_ref is not null
             and not exists (select 1 from books where libib_ref = r.libib_ref and id <> v_existing.id))
      then
        update books set
          title = r.title, authors = r.authors, publisher = r.publisher,
          published_year = r.published_year, genres = r.genres,
          description = coalesce(r.description, description),
          cover_url   = coalesce(r.cover_url, cover_url),
          isbn13      = coalesce(isbn13, case when not exists (select 1 from books b2 where b2.isbn13 = r.isbn13 and b2.id <> books.id) then r.isbn13 end),
          libib_ref   = coalesce(libib_ref, case when not exists (select 1 from books b2 where b2.libib_ref = r.libib_ref and b2.id <> books.id) then r.libib_ref end)
        where id = v_book_id;
        v_changed := v_changed + 1;
      end if;
    end if;
    v_existing := null;
    v_seen := v_seen || v_book_id;

    -- exemplares: item_ref determinístico "<chave>#<k>"
    for k in 1 .. greatest(r.copies, 0) loop
      v_ref := v_key || '#' || k;
      select * into v_copy from copies where libib_item_ref = v_ref;
      if v_copy.id is null then
        insert into copies(book_id, label_code, libib_item_ref, status, acquired_at)
        values (v_book_id, 'MC-' || lpad(nextval('copy_label_seq')::text, 5, '0'), v_ref, 'available', current_date);
        v_copies_new := v_copies_new + 1;
      elsif v_copy.status = 'withdrawn' then
        update copies set status = 'available' where id = v_copy.id;   -- voltou ao acervo
        v_copies_reactivated := v_copies_reactivated + 1;
      end if;
      v_copy := null;
    end loop;

    -- exemplares a mais que o Libib informa: retira só os disponíveis (nunca mexe em held/on_loan)
    update copies set status = 'withdrawn'
    where book_id = v_book_id and status = 'available'
      and libib_item_ref like v_key || '#%'
      and substring(libib_item_ref from '#(\d+)$')::int > r.copies;
    get diagnostics v_n = row_count;
    v_copies_withdrawn := v_copies_withdrawn + v_n;
  end loop;

  -- itens sumidos do Libib: livros vindos do Libib que não estão no lote
  select count(*) into v_missing from books
   where libib_ref is not null and id <> all (v_seen)
     and exists (select 1 from copies where book_id = books.id and status <> 'withdrawn');
  update copies set status = 'withdrawn'
   where status = 'available'
     and book_id in (select id from books where libib_ref is not null and id <> all (v_seen));
  get diagnostics v_n = row_count;
  v_copies_withdrawn := v_copies_withdrawn + v_n;

  insert into catalog_imports(source, rows_total, rows_new, rows_changed, rows_missing, raw)
  values ('libib', v_total, v_new, v_changed, v_missing,
          jsonb_build_object('batch_id', p_batch_id, 'copies_new', v_copies_new,
                             'copies_withdrawn', v_copies_withdrawn,
                             'copies_reactivated', v_copies_reactivated))
  returning id into v_import_id;

  return jsonb_build_object('import_id', v_import_id, 'rows_total', v_total, 'rows_new', v_new,
    'rows_changed', v_changed, 'rows_missing', v_missing, 'copies_new', v_copies_new,
    'copies_withdrawn', v_copies_withdrawn, 'copies_reactivated', v_copies_reactivated);
end $$;

revoke all on function import_catalog(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function import_catalog(uuid) to service_role;
  end if;
end $$;
