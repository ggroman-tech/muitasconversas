-- Muitas Conversas — schema v1 (fonte: site-assinante-banco-de-dados.md)
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ===== enums =====
create type subscription_status as enum ('pending','active','past_due','paused','canceled');
create type copy_status         as enum ('available','held','on_loan','lost','damaged','withdrawn');
create type reservation_status  as enum ('queued','offered','fulfilled','expired','canceled');
create type loan_status         as enum ('scheduled','active','return_requested','returned','overdue','lost');
create type visit_status        as enum ('requested','confirmed','out_for_delivery','done','failed','canceled');
create type visit_direction     as enum ('deliver','collect');
create type payment_status      as enum ('pending','paid','failed','refunded');
create type staff_role          as enum ('admin','ops','driver');

-- ===== pessoas =====
create table customers (
  id            uuid primary key references auth.users(id),
  full_name     text not null,
  email         citext not null unique,
  whatsapp      text,
  source        text,
  pagarme_customer_id text unique,
  created_at    timestamptz not null default now(),
  anonymized_at timestamptz
);

create table served_areas (
  id          serial primary key,
  name        text not null unique,
  cep_prefixes text[] not null default '{}',
  active      boolean not null default true
);

create table addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  area_id      int  not null references served_areas(id),
  cep          text not null,
  street       text not null,
  number       text not null,
  complement   text,
  reference    text,
  is_default   boolean not null default true,
  archived_at  timestamptz
);
create unique index on addresses(customer_id) where is_default and archived_at is null;

create table consents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  purpose     text not null,
  version     text not null,
  granted     boolean not null,
  created_at  timestamptz not null default now()
);

create table staff_members (
  user_id uuid primary key references auth.users(id),
  role    staff_role not null
);

-- ===== cobrança (Pagar.me) =====
create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id),
  status        subscription_status not null default 'pending',
  started_at    timestamptz,
  current_period_end date,
  paused_until  date,
  canceled_at   timestamptz,
  pagarme_subscription_id text unique,
  payment_method text default 'pix'
);
create unique index one_active_subscription_per_customer
  on subscriptions(customer_id) where status <> 'canceled';

-- ===== eventos (antes de payments por causa da FK) =====
create table events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  starts_at   timestamptz not null,
  venue       text,
  price_cents int not null default 0,
  capacity    int,
  subscribers_only boolean not null default true,
  published   boolean not null default false
);
create table event_registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id),
  customer_id uuid not null references customers(id),
  status      text not null default 'registered',
  created_at  timestamptz not null default now(),
  unique (event_id, customer_id)
);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id),
  subscription_id uuid references subscriptions(id),
  event_registration_id uuid references event_registrations(id),
  amount_cents  int not null,
  status        payment_status not null default 'pending',
  pagarme_transaction_id text unique,
  payment_method text,
  due_at        date,
  paid_at       timestamptz,
  attempt       int not null default 1,
  created_at    timestamptz not null default now(),
  check ((subscription_id is not null) <> (event_registration_id is not null))
);

-- ===== catálogo =====
-- array_to_string é só STABLE; o wrapper imutável permite a coluna gerada.
create function immutable_array_to_string(text[], text) returns text
  language sql immutable parallel safe as $$ select array_to_string($1, $2) $$;

create table books (
  id          uuid primary key default gen_random_uuid(),
  isbn13      text unique,
  title       text not null,
  authors     text[] not null default '{}',
  publisher   text,
  published_year int,
  genres      text[] not null default '{}',
  description text,
  cover_url   text,
  libib_ref   text unique,
  search      tsvector generated always as
              (to_tsvector('portuguese', coalesce(title,'')||' '||immutable_array_to_string(authors,' '))) stored
);
create index on books using gin(search);
create index on books using gin(genres);

create table copies (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id),
  label_code  text unique not null,
  libib_item_ref text unique,
  condition   text,
  status      copy_status not null default 'available',
  acquired_at date,
  notes       text
);
create index on copies(book_id, status);

create table catalog_imports (
  id          uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  source      text not null,
  rows_total  int, rows_new int, rows_changed int, rows_missing int,
  raw         jsonb
);

-- ===== fluxo do livro =====
create table reservations (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  book_id     uuid not null references books(id),
  status      reservation_status not null default 'queued',
  queued_at   timestamptz not null default now(),
  offered_copy_id uuid references copies(id),
  hold_expires_at timestamptz,
  closed_at   timestamptz
);
create unique index on reservations(customer_id, book_id) where status in ('queued','offered');
create index on reservations(book_id, queued_at) where status = 'queued';

create table loans (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  copy_id     uuid not null references copies(id),
  reservation_id uuid references reservations(id),
  status      loan_status not null default 'scheduled',
  delivered_at timestamptz,
  due_date    date,
  returned_at timestamptz,
  renewals    int not null default 0,
  return_condition text,
  created_at  timestamptz not null default now()
);
create unique index one_open_loan_per_customer on loans(customer_id)
  where status in ('scheduled','active','return_requested','overdue');
create unique index one_open_loan_per_copy on loans(copy_id)
  where status in ('scheduled','active','return_requested','overdue');

-- ===== logística de sábado =====
create table delivery_days (
  id          serial primary key,
  day         date unique not null,
  cutoff_at   timestamptz not null,
  status      text not null default 'open'
);

create table delivery_windows (
  id          serial primary key,
  delivery_day_id int not null references delivery_days(id),
  area_id     int not null references served_areas(id),
  starts_at   time not null,
  ends_at     time not null,
  capacity    int not null
);

create table visits (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  address_id  uuid not null references addresses(id),
  window_id   int  not null references delivery_windows(id),
  status      visit_status not null default 'requested',
  route_order int,
  customer_note text,
  cost_cents  int,
  completed_at timestamptz
);
create index on visits(window_id, status);

create table visit_items (
  visit_id uuid not null references visits(id) on delete cascade,
  loan_id  uuid not null references loans(id),
  direction visit_direction not null,
  primary key (visit_id, loan_id, direction)
);

-- ===== comunicação =====
create table email_log (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  loan_id     uuid references loans(id),
  kind        text not null,
  dedupe_key  text unique not null,
  sent_at     timestamptz not null default now(),
  subject     text,
  body_preview text
);
create index on email_log(customer_id, sent_at desc);

-- ===== sistema =====
create table settings (
  key text primary key, value jsonb not null, updated_at timestamptz default now()
);
insert into settings(key,value) values
 ('plan_price_cents','3000'),
 ('max_open_loans','1'),
 ('loan_days','28'),
 ('renewal_allowed','false'),
 ('late_fee_cents','null'),
 ('hold_hours','72'),
 ('reserve_while_reading','true'),
 ('reminder_days_before','[7,3,1]'),
 ('site_url','"https://muitasconversas.com.br"');

create table audit_log (
  id bigserial primary key, at timestamptz default now(),
  actor uuid, action text, entity text, entity_id text, diff jsonb
);
