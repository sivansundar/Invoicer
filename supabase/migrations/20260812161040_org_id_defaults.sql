/**
 * The caller's org, for use as a column default on every tenant-scoped
 * table.
 *
 * Why this exists: without it every insert in application code has to carry
 * `org_id` explicitly, which means the value is chosen in TypeScript. That
 * reads as though tenancy is an application concern — the next person adding
 * a table copies the pattern, and the one after that forgets. With a default,
 * `org_id` is never mentioned in application code at all, and the answer to
 * "how does a row get its org?" is the same everywhere.
 *
 * `security definer` because `org_members` is itself under RLS; the function
 * must read the caller's membership row without depending on a policy that a
 * future change might narrow. That makes the `auth.uid()` filter below
 * load-bearing rather than a convenience: with RLS bypassed, a body that did
 * not filter by the caller would return some other user's org and turn this
 * default into a cross-tenant write primitive.
 *
 * `set search_path = ''` forces every reference to be schema-qualified, so
 * the function cannot be hijacked by a shadowing object in a caller-controlled
 * schema. `stable` because it only reads, and reads the same value within a
 * statement.
 */
create or replace function private.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_ids uuid[];
begin
  select array_agg(om.org_id) into v_org_ids
    from public.org_members om
   where om.user_id = (select auth.uid());

  -- No membership: an unauthenticated caller, or a service-role insert that
  -- omitted org_id. Return null and let the column's own `not null`
  -- constraint produce the error, rather than inventing a different one here
  -- that callers would have to learn separately.
  if v_org_ids is null then
    return null;
  end if;

  -- The solo-UX assumption, stated so it fails loudly instead of guessing.
  -- The schema is workspace-ready (org_members is a join table and a user
  -- could hold several rows), but the product exposes exactly one org per
  -- user today, which is what makes a scalar default correct at all. When
  -- multi-org arrives this raises, and every insert site has to say which
  -- org it means — a visible, one-time migration rather than rows silently
  -- landing in whichever org sorted first.
  if array_length(v_org_ids, 1) > 1 then
    raise exception 'user % belongs to % orgs; org_id must be passed explicitly',
      (select auth.uid()), array_length(v_org_ids, 1)
      using errcode = '22023';
  end if;

  return v_org_ids[1];
end;
$$;

-- Same grant shape, and the same reasoning, as private.is_org_member — see
-- the comment above its own grant in *_rls_policies.sql. `private` is not in
-- PostgREST's exposed schemas, so this is a privilege to *evaluate the
-- default*, not an RPC anyone can call over the wire.
--
-- service_role stays revoked deliberately: an admin client bypasses RLS, so
-- letting it fall back to "whatever org the JWT implies" is exactly the
-- ambiguity worth refusing. Service-role inserts pass org_id explicitly.
revoke execute on function private.current_org_id()
  from public, anon, authenticated, service_role;
grant execute on function private.current_org_id() to authenticated;

alter table public.brands          alter column org_id set default private.current_org_id();
alter table public.clients         alter column org_id set default private.current_org_id();
alter table public.invoices        alter column org_id set default private.current_org_id();
alter table public.email_templates alter column org_id set default private.current_org_id();

-- Bridge column, not the permanent design.
--
-- Brand logos are base64 data URLs in the app today. The permanent home is
-- Supabase Storage, addressed by `logo_path` (already present, still unused);
-- moving them is its own phase because it changes how the PDF renderer
-- resolves an image. Until then this column carries what the app already
-- produces, so cutting the data layer over to Postgres does not silently
-- break logo upload.
--
-- The logos phase migrates logo_data -> Storage and drops this column.
alter table public.brands add column logo_data text;

comment on column public.brands.logo_data is
  'Base64 data URL. Temporary bridge until logos move to Storage (logo_path); dropped then.';
