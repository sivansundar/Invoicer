create extension if not exists pgcrypto;

create schema if not exists private;

create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.org_members (
  org_id   uuid not null references public.orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null default 'owner' check (role in ('owner', 'member')),
  primary key (org_id, user_id)
);

-- The PK already indexes (org_id, user_id); this covers lookups by user,
-- which is the direction every RLS check reads.
create index org_members_user_id_idx on public.org_members (user_id);

/**
 * Creates one org and one owner membership for each new user.
 *
 * `security definer` because it writes to public tables from a trigger on
 * `auth.users`, where the inserting role has no rights. `search_path = ''`
 * forces every reference to be schema-qualified, so the function cannot be
 * hijacked by a shadowing object in a caller-controlled schema.
 *
 * `raw_user_meta_data` is user-editable, so it is used here ONLY as a
 * display name — never for any authorization decision.
 */
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  insert into public.orgs (name)
  values (coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    'My workspace'
  ))
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Supabase CLI 2.113+ ships `auto_expose_new_tables = false` (matching the
-- current cloud default; the flag itself is deprecated and removed
-- 2026-10-30), so a new table in `public` carries NO role grants at all.
--
-- `service_role` bypasses RLS but that is orthogonal to table-level
-- privileges — without this grant even the service-role admin client used by
-- the integration tests gets `permission denied for table org_members`
-- (SQLSTATE 42501).
--
-- Only `service_role` is granted here. The `anon`/`authenticated` exposure
-- surface is deliberately consolidated into one reviewable migration in
-- Task 5, so "who can reach this data" is decided in a single place rather
-- than scattered across every table migration.
grant usage on schema public to service_role;
grant all on public.orgs, public.org_members to service_role;
