-- Brand logos move out of the `brands.logo_data` bridge column and into a
-- private bucket. Objects are content-addressed:
--
--   brand-logos/{brand_id}/{sha256}.png
--
-- Replacing a logo writes a NEW object rather than overwriting one, so an
-- already-issued invoice keeps resolving the logo it was issued with. That
-- is the immutability `brand_snapshot` already promises; a mutable path
-- would silently rewrite the appearance of documents already sent.

insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', false)
on conflict (id) do nothing;

-- No policy on `storage.buckets`. It ships with RLS enabled and no policies,
-- so `getBucket()`/`listBuckets()` 404 for every authenticated caller
-- regardless of what they own — but no application code path calls either:
-- `upload`, `createSignedUrl`, and `list` all work against `storage.objects`
-- without it. Adding one just to make a test introspect bucket metadata
-- would be production security surface with no caller, and the next bucket
-- would inherit the pattern by copy-paste without anyone re-deriving whether
-- it was needed. Privacy is instead asserted the way the app actually
-- depends on it: that an object is unreadable without a signature.
--
-- Tenancy without `org_id`.
--
-- The spec originally keyed the path by org_id and called
-- `private.is_org_member` on the first segment. A Storage path has no column
-- default, so that would force the client to learn its own org_id — breaking
-- the invariant every table relies on (see spec §8.1).
--
-- Joining `public.brands` instead is a real check, not a weaker one: policy
-- expressions evaluate with the QUERYING role's privileges, so `brands`' own
-- RLS filters this subquery to the caller's org. A user holding a stranger's
-- brand UUID still selects zero rows.
--
-- Compared as text, deliberately. `((storage.foldername(objects.name))[1])::uuid`
-- RAISES 22P02 on a non-uuid segment rather than returning false, and `and`
-- has no guaranteed evaluation order, so a regex guard in the same expression
-- would not reliably prevent it. A policy that throws turns a permission
-- check into a 500. `uuid::text` is canonical lowercase and
-- `crypto.randomUUID()` produces exactly that, so real paths match.
--
-- `objects.name`, qualified, not bare `name`. `brands` has its own `name`
-- column (the brand's display name), so inside the correlated subquery an
-- unqualified `name` resolves to the innermost scope — `brands.name` — not
-- the object path. That silently made every check false (a brand's display
-- name is never a folder segment), which fails closed for legitimate owners
-- rather than open, but is still wrong: it was caught by the "lets an owner
-- upload" happy-path test, not by the falsification step.
create policy "brand logos are readable by their brand's org"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "brand logos are writable by their brand's org"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = (storage.foldername(objects.name))[1]
    )
  );

-- Upsert needs UPDATE as well as INSERT. An `upload(..., { upsert: true })`
-- against an existing path issues an `INSERT ... ON CONFLICT DO UPDATE`
-- against `storage.objects` under the hood; with only the INSERT policy
-- above, RLS denies that upsert outright — the call rejects with a
-- `StorageApiError` (`AccessDenied`, HTTP 403), not a silent no-op. A plain
-- denied `UPDATE` would instead return `UPDATE 0`; it's the `ON CONFLICT DO
-- UPDATE` form specifically that raises `42501` on a policy violation. Both
-- `using` and `with check` are required: `using` picks the row to update,
-- `with check` validates the result.
create policy "brand logos are replaceable by their brand's org"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = (storage.foldername(objects.name))[1]
    )
  )
  with check (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = (storage.foldername(objects.name))[1]
    )
  );

-- No DELETE policy. Content addressing means an old object is still
-- referenced by every invoice snapshot issued while it was current; deleting
-- it would break documents already sent. See the Phase 3 plan, Decision 3.

comment on column public.brands.logo_path is
  'Storage object path within the brand-logos bucket: {brand_id}/{sha256}.png.';
