-- Every table created in `public` picks up TRUNCATE, REFERENCES and TRIGGER
-- for `anon` and `authenticated` for free — this is a default ACL Supabase's
-- own bootstrap sets up per-role (`select * from pg_default_acl where
-- defaclnamespace = 'public'::regnamespace` shows it), independent of
-- `auto_expose_new_tables` and independent of anything `*_rls_policies.sql`
-- grants explicitly. None of our migrations asked for these three; they
-- were present on every domain table from the moment it was created.
--
-- RLS does not help here: `enable row level security` and every `using`/
-- `with check` clause only ever gate SELECT/INSERT/UPDATE/DELETE. TRUNCATE
-- has no policy concept to attach to, so a table can be fully protected by
-- RLS and still be truncatable outright by any role holding the privilege —
-- confirmed live: `set local role authenticated; truncate public.invoices
-- cascade;` succeeds and cascades to `invoice_items` even though every
-- `select` on that role is correctly scoped to one org. REFERENCES and
-- TRIGGER are lower-stakes (create an FK against these tables / attach a
-- trigger to them) but are just as ungoverned by policy and just as
-- unneeded by `anon`/`authenticated`, so they go too.
--
-- Not reachable today — PostgREST never emits TRUNCATE, and both roles are
-- NOLOGIN — but it is a data-destroying privilege sitting with no policy
-- behind it, so it is revoked outright rather than left "not currently
-- reachable". `src/test/integration/anon-grants.test.ts` now asserts
-- TRUNCATE is absent for `anon` for the same reason.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

-- Without this, the very next `create table` in `public` would silently
-- reopen the hole this migration just closed, via the same default-ACL
-- mechanism described above.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- `invoices.updated_at` has defaulted to `now()` on insert since
-- `*_domain_tables.sql`, but nothing has ever updated it on UPDATE — the
-- only trigger in the database is `on_auth_user_created`. Phase 2 will read
-- this column as a modification timestamp; left alone it would silently lie
-- from the first edit onward. `security invoker` because setting a NEW
-- field on the row being written needs no elevated privileges — this is not
-- a cross-table check like `is_org_member`. `set search_path = ''` for the
-- same hijack-resistance reason as every other function in this schema.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function private.set_updated_at();
