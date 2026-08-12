-- Cross-tenant integrity gap: FK checks bypass RLS, so nothing stops a
-- tenant setting invoices.brand_id / client_id to a UUID belonging to
-- another org. Because the unique keys omitted org_id, that tenant could
-- insert rows under their own org_id carrying the victim's brand_id and
-- squat (brand_id, number_year, number_seq) -- making the victim's future
-- create_invoice RPC collide with 23505 or silently skip numbers.
--
-- Fixed with composite foreign keys rather than a same-org check trigger.
-- A trigger runs application logic that could be disabled, dropped, or
-- bypassed by any code path with elevated privileges (or a future
-- `session_replication_role = replica`); a composite FK is enforced by the
-- FK machinery itself, has no RLS interaction, and needs no elevated
-- privileges to stay correct. See the constraint comment below for the
-- long-form rationale -- without it, someone will "simplify" these back to
-- single-column FKs.

-- 1. Composite unique keys on the referenced side, so (org_id, id) can be
-- an FK target.
alter table public.brands
  add constraint brands_org_id_id_key unique (org_id, id);
alter table public.clients
  add constraint clients_org_id_id_key unique (org_id, id);

-- 2. Replace the single-column FKs with composite ones scoped to org_id.
alter table public.invoices drop constraint invoices_brand_id_fkey;
alter table public.invoices drop constraint invoices_client_id_fkey;

alter table public.invoices
  add constraint invoices_brand_id_fkey
  foreign key (org_id, brand_id) references public.brands (org_id, id)
  on delete restrict;

-- The (client_id) column list on `set null` is essential: without it,
-- deleting a client would null every referencing column, including
-- org_id, which is `not null` -- so the delete would error instead of
-- detaching the invoice from the client.
alter table public.invoices
  add constraint invoices_client_id_fkey
  foreign key (org_id, client_id) references public.clients (org_id, id)
  on delete set null (client_id);

comment on constraint invoices_brand_id_fkey on public.invoices is
  'Composite (org_id, brand_id) FK, not single-column: foreign-key checks '
  'bypass RLS, so tenant scoping must live in the key itself or a tenant '
  'could reference another org''s brand. Do not simplify to (brand_id) '
  'alone.';
comment on constraint invoices_client_id_fkey on public.invoices is
  'Composite (org_id, client_id) FK, not single-column: foreign-key checks '
  'bypass RLS, so tenant scoping must live in the key itself or a tenant '
  'could reference another org''s client. `on delete set null (client_id)` '
  'nulls only client_id, not org_id, which is not null. Do not simplify to '
  '(client_id) alone.';

-- 3. Fold org_id into both unique constraints -- defence in depth, and
-- self-documenting tenant scope.
alter table public.invoices drop constraint invoices_number_unique;
alter table public.invoices add  constraint invoices_number_unique
  unique (org_id, brand_id, invoice_number);

alter table public.invoices drop constraint invoices_seq_unique;
alter table public.invoices add  constraint invoices_seq_unique
  unique (org_id, brand_id, number_year, number_seq);

-- 4. Index every FK column. Postgres does not index the referencing side
-- of a foreign key automatically, and the composite FKs above are not
-- fully served by the existing single-column indexes (a composite FK
-- lookup/cascade scans (org_id, brand_id) and (org_id, client_id)
-- together). The single-column invoices_brand_id_idx / invoices_client_id_idx
-- are dropped: invoices_org_id_idx already covers plain org_id lookups,
-- the two new composite indexes have brand_id/client_id as a leading-adjacent
-- column so they still serve most brand-only/client-only filters reasonably
-- well in this table's size range, and carrying near-duplicate indexes
-- would just add write overhead with no query they uniquely serve.
drop index public.invoices_brand_id_idx;
drop index public.invoices_client_id_idx;

create index invoices_org_brand_idx on public.invoices (org_id, brand_id);
create index invoices_org_client_idx on public.invoices (org_id, client_id);
