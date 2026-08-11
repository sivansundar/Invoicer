create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null,
  address         text not null default '',
  email           text,
  phone           text,
  gst_number      text,
  pan_number      text,
  -- Storage object path, not base64. Populated in a later phase.
  logo_path       text,
  bank_details    jsonb not null default '{}'::jsonb,
  invoice_prefix  text not null,
  accent_color    text not null,
  invoice_design  text not null default 'modern'
                    check (invoice_design in ('modern', 'classic')),
  -- FEATURES.followups is off; the column exists so the shape is stable.
  followup        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index brands_org_id_idx on public.brands (org_id);

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  company_name  text not null,
  name          text,
  address       text not null default '',
  email         text,
  phone         text,
  gst_number    text,
  created_at    timestamptz not null default now()
);
create index clients_org_id_idx on public.clients (org_id);

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  brand_id          uuid not null references public.brands(id) on delete restrict,
  client_id         uuid references public.clients(id) on delete set null,
  invoice_number    text not null,
  -- Nullable so a legacy number that will not parse can still be imported.
  -- Postgres treats nulls as distinct in a unique index, so several such
  -- rows coexist while invoices_number_unique still blocks literal dupes.
  number_year       int,
  number_seq        int,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'paid', 'overdue')),
  currency          text not null check (currency in ('INR', 'USD', 'SGD')),
  bill_date         date not null,
  due_date          date not null,
  paid_on           date,
  client_snapshot   jsonb not null,
  brand_snapshot    jsonb not null,
  subtotal          numeric(14,2) not null default 0,
  total_tax         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  notes             text,
  reminders         date[] not null default '{}',
  followups_paused  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_number_unique unique (brand_id, invoice_number),
  constraint invoices_seq_unique unique (brand_id, number_year, number_seq)
);
create index invoices_org_id_idx on public.invoices (org_id);
create index invoices_brand_id_idx on public.invoices (brand_id);
create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_org_status_idx on public.invoices (org_id, status);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  position     int not null,
  description  text not null default '',
  amount       numeric(14,2) not null default 0,
  tax          numeric(5,2) not null default 0
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  subject     text not null,
  tone        text not null check (tone in ('Friendly', 'Direct', 'Firm')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index email_templates_org_id_idx on public.email_templates (org_id);

-- Same reason as the tenancy migration: new `public` tables carry no role
-- grants under `auto_expose_new_tables = false`, and `service_role`'s
-- BYPASSRLS does not substitute for table privileges. Without this the
-- integration tests in this task fail with `permission denied` before they
-- can assert anything. `anon`/`authenticated` grants stay in Task 5.
grant all on
  public.brands,
  public.clients,
  public.invoices,
  public.invoice_items,
  public.email_templates
to service_role;
