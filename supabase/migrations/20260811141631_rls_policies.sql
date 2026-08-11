/**
 * True when the calling user belongs to the given org.
 *
 * `security definer` does not insulate this from today's `org_members_select`
 * policy — that policy is `user_id = (select auth.uid())`, does not call
 * this function, and would admit exactly the rows this lookup needs anyway,
 * so there is no recursion right now. The value is forward-looking: if a
 * later `org_members` policy calls `is_org_member` (as every other table's
 * policy does), evaluating this function under the caller's own row
 * security would recurse into itself. `security definer` runs the lookup
 * outside RLS, closing that off before it can happen. The identity check on
 * `auth.uid()` is INSIDE the body, so the function cannot be used to probe
 * an arbitrary org. `execute` is revoked from every client role, then
 * re-granted to `authenticated` only, below — see the comment there for why
 * that is not a contradiction. It is still not reachable as an RPC: `private`
 * is not in PostgREST's exposed schemas, regardless of any grant.
 *
 * `stable` lets the planner cache it within a statement.
 */
create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_org_member(uuid)
  from public, anon, authenticated, service_role;

-- Re-granting to `authenticated` looks like it undoes the revoke above. It
-- does not — this is a policy-execution grant, not an RPC-exposure grant,
-- and the two are independent:
--
-- 1. RLS policy expressions run with the QUERYING role's privileges, not
--    the table owner's. `security definer` only governs what happens
--    INSIDE the function body once it is called; it does not waive the
--    EXECUTE check required to call it in the first place. Without this
--    grant, every policy that references the function fails closed with
--    `permission denied for function is_org_member` for every user,
--    including a user reading their own rows — a security control that
--    looks like it is working while actually blocking everyone.
-- 2. This does not reopen the function as a public RPC endpoint. PostgREST
--    only routes `/rpc/<name>` against the schemas in `config.toml`'s
--    `api.schemas` (`public`, `graphql_public`); `private` is not among
--    them, so no grant on this function makes it reachable that way. And
--    even if it were reachable, the function checks `auth.uid()`
--    internally, so it only ever answers "is the CALLING user a member of
--    org X" — a question the caller already knows the answer to. It
--    exposes no other tenant's data.
--
-- `anon`, `public` and `service_role` stay revoked: `anon` and `public`
-- have no legitimate reason to evaluate these policies at all, and
-- `service_role` bypasses RLS entirely, so it never evaluates them either.
grant execute on function private.is_org_member(uuid) to authenticated;

alter table public.orgs enable row level security;
alter table public.orgs force row level security;

create policy orgs_select on public.orgs
  for select to authenticated
  using ((select private.is_org_member(id)));

-- Orgs are created only by the signup trigger, which is security definer.
-- No insert/update/delete policy exists, so clients cannot do any of them.

alter table public.org_members enable row level security;
alter table public.org_members force row level security;

create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No write policies: memberships are managed by the signup trigger only.
-- Invites arrive with the workspaces feature, not before.

alter table public.brands enable row level security;
alter table public.brands force row level security;

create policy brands_select on public.brands
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy brands_insert on public.brands
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy brands_update on public.brands
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy brands_delete on public.brands
  for delete to authenticated
  using ((select private.is_org_member(org_id)));

alter table public.clients enable row level security;
alter table public.clients force row level security;

create policy clients_select on public.clients
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy clients_insert on public.clients
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy clients_update on public.clients
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy clients_delete on public.clients
  for delete to authenticated
  using ((select private.is_org_member(org_id)));

alter table public.invoices enable row level security;
alter table public.invoices force row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy invoices_update on public.invoices
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy invoices_delete on public.invoices
  for delete to authenticated
  using ((select private.is_org_member(org_id)));

alter table public.email_templates enable row level security;
alter table public.email_templates force row level security;

create policy email_templates_select on public.email_templates
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy email_templates_insert on public.email_templates
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy email_templates_update on public.email_templates
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy email_templates_delete on public.email_templates
  for delete to authenticated
  using ((select private.is_org_member(org_id)));

-- invoice_items has no org_id; it authorizes through its parent invoice.

alter table public.invoice_items enable row level security;
alter table public.invoice_items force row level security;

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

create policy invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

create policy invoice_items_update on public.invoice_items
  for update to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ))
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

create policy invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

-- A grant and a policy are two halves of one security decision: the grant
-- says whether the role may address the table AT ALL; RLS then says which
-- rows it sees once it's in. Postgres checks grants first, so these live
-- here, beside the policies they mirror, rather than in a separate
-- "grants" migration that a future reader of the policies would never think
-- to open. (CLI 2.113+ ships `auto_expose_new_tables = false`: a new table
-- in `public` carries no role grants until one is written explicitly — see
-- the `service_role` grants in the Task 2/3 migrations for the same
-- mechanism on the admin side.)
--
-- These grants mirror the policies above exactly: full CRUD on the five
-- domain tables, which all have insert/update/delete policies; select-only
-- on `orgs` and `org_members`, which are written solely by the signup
-- trigger and have no write policies at all. Do not widen the latter two to
-- CRUD for symmetry's sake — that would grant table-level access the
-- policies were deliberately never written to allow.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.brands,
  public.clients,
  public.invoices,
  public.invoice_items,
  public.email_templates
to authenticated;

grant select on public.orgs, public.org_members to authenticated;

-- `anon` is granted nothing at all, deliberately: every route that touches
-- data requires a session. Task 5 proves it with a test rather than trusting
-- the absence of a grant statement.
