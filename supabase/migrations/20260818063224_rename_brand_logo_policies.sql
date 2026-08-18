-- Names only. The three brand-logo policies were created with English
-- sentences for names, where every policy in 20260811141631_rls_policies.sql
-- is `<table>_<verb>`. Postgres has no ALTER POLICY ... RENAME that also
-- preserves the expression across a drop, so each is dropped and recreated
-- with its body transcribed verbatim from the original migration.
--
-- The text comparison below is deliberate and must survive the rename:
-- `::uuid` RAISES 22P02 on a non-uuid path segment rather than returning
-- false, and `and` has no guaranteed evaluation order — a policy that throws
-- turns a permission check into a 500. See the original migration's comments
-- for the full reasoning.
--
-- Still no DELETE policy. Content addressing means an old object may still
-- be the one an already-issued invoice's frozen brand_snapshot references;
-- deleting on brand-delete or re-upload would break rendering that PDF.

drop policy "brand logos are readable by their brand's org" on storage.objects;
drop policy "brand logos are writable by their brand's org" on storage.objects;
drop policy "brand logos are replaceable by their brand's org" on storage.objects;

create policy brand_logos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'brand-logos'
    and exists (
      select 1 from public.brands b
      where b.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy brand_logos_insert
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
create policy brand_logos_update
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

