# SaaS Phase 3 — Brand Logos to Storage, and the localStorage Importer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move brand logos out of the `brands.logo_data` bridge column into a private Storage bucket, and give a user arriving from the local-only build a one-time prompt that imports their `localStorage` data into their account.

**Architecture:** A private `brand-logos` bucket holds content-addressed PNGs at `{brand_id}/{sha256}.png`. Tenancy is enforced by a policy that joins `public.brands`, leaning on that table's own RLS rather than putting `org_id` into application code. `BrandSnapshot` and `Brand` each gain `logoPath?` while keeping `logo?`, and one resolver serves both shapes — the dual path is permanent, because the importer keeps bringing in pre-Postgres snapshots carrying base64. The import pipeline already built for backup restore is lifted out of `import-export.tsx` into a module both the file importer and the new prompt call.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript, Supabase (Postgres + PostgREST + Storage), `@supabase/ssr`, `@tanstack/react-query` 5.101.4 (pinned), `@react-pdf/renderer`, vitest.

**Source spec:** `docs/superpowers/specs/2026-08-11-saas-foundation-design.md` §8 (as amended 2026-08-13), §11 (as amended), and the "Do this first in Phase 3" section of `docs/PHASE3-CARRYOVER.md`.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Baseline.** Branch `feat/saas-phase3-logos-import` from `v1` @ `51553ba` (PR #8 merged): **528 unit tests + 102 integration tests passing, clean build, zero lint problems, `supabase db advisors --local` clean for both `--type security` and `--type performance`.** Every task must leave all of those true.

**Verification for every task:** `npx tsc --noEmit` passes, `npm run lint` reports zero problems, `npm test` passes, and — for any task touching SQL, Storage or the seam — `npm run test:integration` passes. The build must still show `ƒ Proxy (Middleware)`.

**No `org_id` in application code.** Unchanged from Phase 2, and it is the reason §8's path template was amended. Tables fill `org_id` from a column default; Storage paths are keyed by `brand_id` so no client code ever needs to know an org id. A task that introduces `org_id` into TypeScript has failed even if it produces the right answer.

**Nothing writes to `invoicer_*` keys.** Phase 2 removed the migration-on-mount because it rewrote a user's local data before they chose to bring it into their account — for anyone still on the old build that is their only copy. This phase *reads* those keys and never writes them. The only exception is the dismissal flag, which is a new key of its own (`invoicer_import_prompt`), not one of the data keys.

**The seam still throws; it does not return `false`.** `tsc` cannot catch a regression here — `if (!save(x))` on a promise is never true. New seam functions reject on failure like every other one.

**SQL conventions** (unchanged): lowercase identifiers, an index on every foreign key column, no `add constraint if not exists`. Never invent a migration filename — always `supabase migration new <name>`.

**Policies must be falsified, not asserted.** A policy that fails *open* is indistinguishable from one that works when you only test the happy path. Every policy this phase adds gets a test that signs in as a *second* user and proves denial. Phase 1 shipped an RLS helper that was wrong in exactly this way and every happy-path test passed.

**Commits:** one per task, conventional-commit prefix, ending with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Decisions this plan makes

Four things that would otherwise be decided ad hoc mid-execution.

### 1. The storage policy compares as text, not by casting to `uuid`

The obvious policy is `b.id = ((storage.foldername(name))[1])::uuid`. If anyone uploads to a path whose first segment is not a uuid, that cast **raises** rather than returning false — turning a permission check into a `22P02` error. Worse, `and` in a policy has no guaranteed evaluation order, so guarding it with a regex in the same expression does not reliably prevent the cast.

**Decision:** compare `b.id::text = (storage.foldername(name))[1]`. `uuid::text` is canonical lowercase, and `crypto.randomUUID()` produces exactly that, so legitimate paths match. A garbage path matches nothing and is denied, which is the correct outcome.

Rejected: a `private.safe_uuid(text)` helper. It works (see Decision 2 for why `private` is reachable from a policy), but it adds a function to a schema Phase 1 deliberately kept narrow, to solve a problem a text comparison already solves.

### 2. Why a policy may call into `private` when an RPC may not

Phase 2 recorded that the invoice RPCs could not call `private` helpers — `permission denied for schema private` — while every RLS policy calls `private.is_org_member` happily. Both are true, and the reason matters here because it is the kind of thing that gets "fixed" by granting `usage on schema private to authenticated`, which would widen a boundary Phase 1 drew on purpose.

`private` has **no** schema `usage` grant (`pg_namespace.nspacl` is null). A policy expression is stored as a parsed tree holding the function's **OID**, so at execution time Postgres checks `execute` on the function and never re-resolves the schema name. A plpgsql function body resolves names at **runtime**, so it does need `usage`.

**Decision:** this phase does not grant `usage on schema private` to anything. The storage policy needs no helper anyway (Decision 1).

### 3. Old objects are never deleted

Content addressing means replacing a logo writes a new object; the old one stays. Deleting it would break every already-issued invoice whose snapshot points at it — which is the entire point of content addressing.

**Decision:** nothing in this phase deletes from the bucket, including when a brand is deleted. Storage grows monotonically with the number of *distinct logo images* a user has ever uploaded, bounded by `MAX_LOGO_STORED_BYTES` (80KB) each. Recorded as a known limitation for the Phase 4 carry-over, together with the note that DPDP erasure must delete a departing org's objects by listing its brands (§8.1).

### 4. The import pipeline moves out of the component before the prompt is built

`import-export.tsx` holds both the dialog and the validate → normalise → default-currency → remap → write pipeline. The prompt needs the pipeline without the dialog. Copying it would leave two implementations of a data-import path, and they would diverge.

**Decision:** Task 6 is a pure refactor — extract to `src/lib/import-pipeline.ts`, no behaviour change, existing tests must pass **unmodified**. Any test that needs editing to survive Task 6 is evidence the refactor changed behaviour.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_brand_logos_bucket.sql` | Bucket, three policies, the `logo_path` comment update |
| `src/lib/logo-storage.ts` | `sha256Hex`, `dataUrlToBytes`, `logoObjectPath` — pure, no Supabase import |
| `src/hooks/use-logo-src.ts` | `useLogoSrc(source)` — resolves base64 or path to a renderable `src` |
| `src/components/brands/brand-logo.tsx` | `<BrandLogo>` — the img/initial fallback, one implementation |
| `src/lib/import-pipeline.ts` | The import pipeline lifted out of `import-export.tsx` |
| `src/lib/local-data.ts` | `readLocalCollections`, `hasLocalData`, dismissal flag |
| `src/components/import/local-import-prompt.tsx` | The one-time prompt |
| `src/test/integration/storage.test.ts` | Bucket policy tests, including cross-tenant denial |

**Modified**

| File | Change |
|---|---|
| `src/lib/types.ts` | `Brand.logoPath?`, `BrandSnapshot.logoPath?` |
| `src/lib/supabase/mappers.ts` | Map `logo_path` both ways; keep `logo_data` |
| `src/lib/storage.ts` | `uploadBrandLogo`, `getLogoUrl`; `saveBrand` uploads a fresh data URL |
| `src/lib/query-client.ts` | `queryKeys.logoUrl(path)` |
| `src/lib/migrate.ts` | `snapshotFromBrand` carries `logoPath` |
| `src/components/invoices/designs/{modern,classic}-invoice-preview.tsx` | Render through `<BrandLogo>` |
| `src/app/(app)/invoices/[id]/pdf-download-button.tsx` | Resolve the logo to a data URL before `pdf()`; drop the `alert()` |
| `src/components/invoices/import-export.tsx` | Consume `import-pipeline.ts` |
| `src/components/layout/shell.tsx` | Mount the prompt |
| `src/test/fake-seam.ts` | Add the two new seam functions |
| `README.md`, `docs/PHASE4-CARRYOVER.md` | Docs |

---

## Task 1: The bucket and its policies

**Files:**
- Create: `supabase/migrations/<timestamp>_brand_logos_bucket.sql` (via `supabase migration new brand_logos_bucket`)
- Create: `src/test/integration/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: bucket id `brand-logos`; objects at `{brand_id}/{sha256}.png`; `authenticated` may select/insert/update objects whose first path segment is one of their own brands.

- [ ] **Step 1: Write the failing integration test**

Create `src/test/integration/storage.test.ts`. `signInAsNewUser` and `serviceClient` come from `src/test/integration/helpers.ts` — read that file first; the existing suites (`tenancy.test.ts`, `grants.test.ts`) show the established shape.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signInAsNewUser } from "./helpers";

const BUCKET = "brand-logos";
const PNG = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

async function makeBrand(client: Awaited<ReturnType<typeof signInAsNewUser>>) {
  const { data, error } = await client
    .from("brands")
    .insert({ name: "Acme", invoice_prefix: "ACM", accent_color: "#000000" })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe("brand-logos bucket", () => {
  let userA: Awaited<ReturnType<typeof signInAsNewUser>>;
  let userB: Awaited<ReturnType<typeof signInAsNewUser>>;
  let brandA: string;

  beforeAll(async () => {
    userA = await signInAsNewUser();
    userB = await signInAsNewUser();
    brandA = await makeBrand(userA);
  });

  it("the bucket exists and is private", async () => {
    const { data, error } = await userA.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });

  it("lets an owner upload under their own brand id", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`${brandA}/aaa.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeNull();
  });

  it("lets an owner replace the same object (upsert needs UPDATE, not just INSERT)", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`${brandA}/aaa.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeNull();
  });

  it("lets an owner sign a URL for their own object", async () => {
    const { data, error } = await userA.storage.from(BUCKET).createSignedUrl(`${brandA}/aaa.png`, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain(`${brandA}/aaa.png`);
  });

  // The falsification tests. These are the point of the task.
  it("denies a second user uploading under someone else's brand id", async () => {
    const { error } = await userB.storage.from(BUCKET).upload(`${brandA}/evil.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).not.toBeNull();
  });

  it("denies a second user signing a URL for someone else's object", async () => {
    const { data, error } = await userB.storage.from(BUCKET).createSignedUrl(`${brandA}/aaa.png`, 60);
    expect(data?.signedUrl).toBeUndefined();
    expect(error).not.toBeNull();
  });

  it("denies a second user listing someone else's brand folder", async () => {
    const { data } = await userB.storage.from(BUCKET).list(brandA);
    expect(data ?? []).toEqual([]);
  });

  // A non-uuid first segment must be DENIED, not raise 22P02. A policy that
  // throws turns a permission check into a 500.
  it("denies a path whose first segment is not a brand id, without erroring", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`not-a-uuid/x.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).not.toBeNull();
    expect(JSON.stringify(error)).not.toContain("22P02");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- storage`
Expected: FAIL — the bucket does not exist, so even `getBucket` errors.

- [ ] **Step 3: Write the migration**

Run `supabase migration new brand_logos_bucket`, then fill the generated file:

```sql
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
-- Compared as text, deliberately. `((storage.foldername(name))[1])::uuid`
-- RAISES 22P02 on a non-uuid segment rather than returning false, and `and`
-- has no guaranteed evaluation order, so a regex guard in the same expression
-- would not reliably prevent it. A policy that throws turns a permission
-- check into a 500. `uuid::text` is canonical lowercase and
-- `crypto.randomUUID()` produces exactly that, so real paths match.
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

-- Upsert needs UPDATE as well as INSERT. With only INSERT, replacing an
-- object fails SILENTLY through the Storage API — the call returns without
-- an error and the old bytes stay. Both `using` and `with check` are
-- required: `using` picks the row to update, `with check` validates the
-- result.
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
```

- [ ] **Step 4: Apply and run the test**

```bash
supabase migration up
npm run test:integration -- storage
```
Expected: PASS, all nine.

- [ ] **Step 5: Falsify the tenancy check**

This is required, not optional. Temporarily replace the `exists (...)` in the **select** policy with `true`, re-apply, and re-run.

Expected: the "denies a second user signing a URL" and "denies … listing" tests **fail**. If they still pass, the tests are not proving tenancy and must be fixed before continuing.

Restore the policy, re-apply, confirm green.

- [ ] **Step 6: Advisors**

```bash
supabase db advisors --local --type security
supabase db advisors --local --type performance
```
Expected: no issues found. If a finding names `storage.objects`, resolve it before committing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/test/integration/storage.test.ts
git commit -m "feat(db): private brand-logos bucket, keyed by brand id"
```

---

## Task 2: Content addressing and the seam

**Files:**
- Create: `src/lib/logo-storage.ts`, `src/lib/logo-storage.test.ts`
- Modify: `src/lib/types.ts`, `src/lib/supabase/mappers.ts`, `src/lib/storage.ts`, `src/lib/query-client.ts`, `src/test/fake-seam.ts`
- Test: `src/lib/supabase/mappers.test.ts`, `src/test/integration/seam.test.ts`

**Interfaces:**
- Consumes: the bucket from Task 1.
- Produces:
  - `sha256Hex(bytes: Uint8Array): Promise<string>`
  - `dataUrlToBytes(dataUrl: string): Uint8Array`
  - `logoObjectPath(brandId: string, sha: string): string`
  - `storage.uploadBrandLogo(brandId: string, dataUrl: string): Promise<string>` → object path
  - `storage.getLogoUrl(path: string): Promise<string>` → signed URL
  - `Brand.logoPath?: string`, `BrandSnapshot.logoPath?: string`
  - `queryKeys.logoUrl(path: string)`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/logo-storage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sha256Hex, dataUrlToBytes, logoObjectPath } from "./logo-storage";

describe("dataUrlToBytes", () => {
  it("decodes the base64 payload after the comma", () => {
    // "hi" -> aGk=
    expect(Array.from(dataUrlToBytes("data:image/png;base64,aGk="))).toEqual([104, 105]);
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty input", async () => {
    expect(await sha256Hex(new Uint8Array([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("matches the known digest of 'abc'", async () => {
    expect(await sha256Hex(new Uint8Array([97, 98, 99]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("is stable, so identical images address the same object", async () => {
    const bytes = dataUrlToBytes("data:image/png;base64,aGk=");
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes));
  });
});

describe("logoObjectPath", () => {
  it("puts the brand id first, because that is what the policy checks", () => {
    expect(logoObjectPath("6f1c1d4e-0000-4000-8000-000000000001", "abc")).toBe(
      "6f1c1d4e-0000-4000-8000-000000000001/abc.png"
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- logo-storage`
Expected: FAIL — cannot resolve `./logo-storage`.

- [ ] **Step 3: Implement `src/lib/logo-storage.ts`**

Pure functions only — no Supabase import, so this stays testable without mocking a client.

```ts
/**
 * Content addressing for brand logos. Kept free of any Supabase import so
 * the hashing and path rules are testable on their own — the seam
 * (`@/lib/storage`) is what actually talks to the bucket.
 */

/** Decodes the base64 payload of a data URL. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * The object name is the digest of the image bytes, which is what makes
 * replacing a logo write a new object instead of overwriting one — an
 * invoice issued under the old logo keeps resolving it.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * `{brand_id}/{sha256}.png`. The brand id must be the FIRST segment: the
 * storage policy checks `(storage.foldername(name))[1]` against
 * `public.brands`, so a path shaped any other way is denied.
 *
 * Always `.png` — `downsampleImage` (`@/lib/brands`) re-encodes every upload
 * through a canvas, so nothing else ever reaches the bucket.
 */
export function logoObjectPath(brandId: string, sha: string): string {
  return `${brandId}/${sha}.png`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- logo-storage`
Expected: PASS.

If `crypto.subtle` is undefined under jsdom, add `globalThis.crypto ??= (await import("node:crypto")).webcrypto as Crypto;` to `src/test/setup.ts` rather than changing the implementation — the browser has it natively.

- [ ] **Step 5: Add the types**

In `src/lib/types.ts`, on `Brand` (beside `logo`):

```ts
  logo?: string; // base64 data URL — a fresh upload, or a pre-Storage brand
  /**
   * Storage object path, `{brand_id}/{sha256}.png`. Set once the logo is in
   * the bucket. `logo` above stays for two reasons: the form must preview a
   * file before it is uploaded, and brands written before Storage existed
   * still carry base64 in `logo_data`.
   */
  logoPath?: string;
```

And on `BrandSnapshot` (beside its `logo`):

```ts
  logo?: string;
  /**
   * Set on snapshots frozen after logos moved to Storage. Snapshots frozen
   * before that carry base64 in `logo` and keep rendering from it — and will
   * keep arriving indefinitely, because the §11 importer brings in
   * pre-Postgres invoices. Both shapes are permanent; see spec §8.2.
   */
  logoPath?: string;
```

- [ ] **Step 6: Map the column**

In `src/lib/supabase/mappers.ts`, `BrandRow` already declares `logo_data`. Add `logo_path: string | null;`. Then in `rowToBrand`:

```ts
    logo: orUndefined(row.logo_data),
    logoPath: orUndefined(row.logo_path),
```

and in `brandToRow`:

```ts
    logo_data: orNull(brand.logo),
    logo_path: orNull(brand.logoPath),
```

Add to `src/lib/supabase/mappers.test.ts`:

```ts
  it("carries logo_path in both directions", () => {
    const row = brandToRow({ ...baseBrand, logoPath: "b/abc.png" });
    expect(row.logo_path).toBe("b/abc.png");
    expect(rowToBrand({ ...baseRow, logo_path: "b/abc.png" }).logoPath).toBe("b/abc.png");
  });

  it("nulls logo_path when the brand has none, so the column can be cleared", () => {
    expect(brandToRow({ ...baseBrand, logoPath: undefined }).logo_path).toBeNull();
  });
```

(`baseBrand` / `baseRow` already exist in that file — reuse them rather than inventing new fixtures.)

- [ ] **Step 7: Add the query key**

In `src/lib/query-client.ts`, alongside the existing keys:

```ts
  /**
   * Signed URLs expire, so this key is per-path and the caller sets a
   * `staleTime` below the expiry. Keyed by object path rather than brand id
   * because the path is content-addressed — two brands sharing an image
   * share the URL, and a replaced logo is a different key rather than a
   * stale entry.
   */
  logoUrl: (path: string) => ["logo-url", path] as const,
```

- [ ] **Step 8: Add the seam functions**

In `src/lib/storage.ts`, after the brand functions:

```ts
const LOGO_BUCKET = "brand-logos";

/** How long a signed logo URL is valid. Paired with a shorter `staleTime` in
 *  `useLogoSrc` so a URL is refetched before it expires on screen. */
export const LOGO_URL_TTL_SECONDS = 3600;

/**
 * Uploads a logo and returns its object path.
 *
 * Content-addressed, so uploading the same image twice is idempotent and
 * lands on the same path — `upsert` makes that a no-op write rather than a
 * conflict, which is why the bucket needs an UPDATE policy as well as
 * INSERT.
 */
export async function uploadBrandLogo(brandId: string, dataUrl: string): Promise<string> {
  const bytes = dataUrlToBytes(dataUrl);
  const path = logoObjectPath(brandId, await sha256Hex(bytes));

  const { error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .upload(path, bytes as BufferSource, { contentType: "image/png", upsert: true });
  throwOn(error);
  return path;
}

/** A signed URL for a logo object. The bucket is private; there is no public URL. */
export async function getLogoUrl(path: string): Promise<string> {
  const { data, error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .createSignedUrl(path, LOGO_URL_TTL_SECONDS);
  throwOn(error);
  return data!.signedUrl;
}
```

Import `dataUrlToBytes`, `logoObjectPath` and `sha256Hex` from `./logo-storage` at the top.

Then change `saveBrand` so a fresh data URL is uploaded rather than stored inline:

```ts
export async function saveBrand(brand: Brand): Promise<Brand> {
  // CORRECTED DURING EXECUTION — the row must be written BEFORE the upload.
  // The storage INSERT policy checks `exists (select 1 from public.brands b
  // where b.id::text = ...)`, and brand ids are generated client-side, so on
  // a first save there is no row yet and upload-first is denied by RLS.
  //
  // The cost is that the write is not atomic: a failure after the first
  // upsert leaves the row committed — including every unrelated field edited
  // in the same save — while this function rejects. There is no ordering
  // that both satisfies the policy and keeps the two writes atomic.
  //
  // The base64 written in that first upsert is a deliberate fallback: if the
  // upload then fails, the brand still renders from `logo_data`.
  //
  // Deliberately NOT clearing `logo_data` for brands that still have one and
  // no new upload: that column is what those brands render from until their
  // owner next touches the logo. Task 9 records the residue.
  const { data, error } = await createClient()
    .from("brands")
    .upsert(brandToRow(brand))
    .select("*")
    .single();
  throwOn(error);
  let result = data as BrandRow;

  if (brand.logo?.startsWith("data:")) {
    const logoPath = await uploadBrandLogo(brand.id, brand.logo);
    const { data: updated, error: updateError } = await createClient()
      .from("brands")
      .update({ logo_path: logoPath, logo_data: null })
      .eq("id", brand.id)
      .select("*")
      .single();
    throwOn(updateError);
    result = updated as BrandRow;
  }

  return rowToBrand(result);
}
```

- [ ] **Step 9: Mirror both functions in the fake seam**

In `src/test/fake-seam.ts` — `fake-seam.test.ts` asserts the fake exports exactly what the real module does, so it fails until this is added:

```ts
export const uploadBrandLogo = vi.fn(async (brandId: string, dataUrl: string): Promise<string> => {
  maybeFail("uploadBrandLogo");
  // Deterministic but not a real digest — component tests care that a path
  // is produced and threaded through, not that it hashes correctly. The real
  // hashing has its own unit tests in `logo-storage.test.ts`.
  return `${brandId}/${dataUrl.length}.png`;
});

export const getLogoUrl = vi.fn(async (path: string): Promise<string> => {
  maybeFail("getLogoUrl");
  return `https://signed.test/${path}`;
});
```

Also mirror `saveBrand`'s upload branch, or a component test asserting the upload happened will pass vacuously:

```ts
export const saveBrand = vi.fn(async (brand: Brand): Promise<Brand> => {
  maybeFail("saveBrand");
  if (brand.logo?.startsWith("data:")) {
    const logoPath = await uploadBrandLogo(brand.id, brand.logo);
    return upsert(state.brands, { ...brand, logoPath, logo: undefined });
  }
  return upsert(state.brands, brand);
});
```

Add `export const LOGO_URL_TTL_SECONDS = 3600;` too, for the export-parity test.

- [ ] **Step 10: Add the integration round trip**

In `src/test/integration/seam.test.ts`:

```ts
  it("uploads a logo and reads it back as a signed URL", async () => {
    const brand = await saveBrand(makeBrand({ logo: TINY_PNG_DATA_URL }));
    expect(brand.logoPath).toMatch(new RegExp(`^${brand.id}/[0-9a-f]{64}\\.png$`));
    expect(brand.logo).toBeUndefined();
    await expect(getLogoUrl(brand.logoPath!)).resolves.toContain(brand.logoPath);
  });

  it("re-uploading identical bytes is idempotent, not a conflict", async () => {
    const first = await saveBrand(makeBrand({ logo: TINY_PNG_DATA_URL }));
    const second = await saveBrand({ ...first, logo: TINY_PNG_DATA_URL });
    expect(second.logoPath).toBe(first.logoPath);
  });
```

Define `TINY_PNG_DATA_URL` at the top of the file as a valid 1×1 PNG data URL. Follow the file's existing `makeBrand` helper rather than adding a second one.

- [ ] **Step 11: Run everything**

```bash
npm test && npm run test:integration && npx tsc --noEmit && npm run lint
```
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib src/test src/hooks
git commit -m "feat(storage): content-addressed logo upload through the seam"
```

---

## Task 3: One resolver, one logo component

**Files:**
- Create: `src/hooks/use-logo-src.ts`, `src/components/brands/brand-logo.tsx`, `src/components/brands/brand-logo.test.tsx`
- Modify: `src/components/invoices/designs/modern-invoice-preview.tsx`, `src/components/invoices/designs/classic-invoice-preview.tsx`

**Interfaces:**
- Consumes: `storage.getLogoUrl`, `queryKeys.logoUrl` (Task 2).
- Produces: `useLogoSrc(source: { logo?: string; logoPath?: string }): string | undefined`; `<BrandLogo source name className fallbackClassName />`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/brands/brand-logo.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { BrandLogo } from "./brand-logo";
import { resetFakeSeam } from "@/test/fake-seam";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

describe("BrandLogo", () => {
  beforeEach(() => resetFakeSeam());

  it("renders a legacy base64 logo directly, without signing anything", async () => {
    const { getLogoUrl } = await import("@/test/fake-seam");
    renderWithProviders(<BrandLogo source={{ logo: "data:image/png;base64,aGk=" }} name="Acme" />);

    expect(await screen.findByRole("img", { name: "Acme" })).toHaveAttribute(
      "src",
      "data:image/png;base64,aGk="
    );
    expect(getLogoUrl).not.toHaveBeenCalled();
  });

  it("signs a URL for a path-backed logo", async () => {
    renderWithProviders(<BrandLogo source={{ logoPath: "b1/abc.png" }} name="Acme" />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Acme" })).toHaveAttribute(
        "src",
        "https://signed.test/b1/abc.png"
      )
    );
  });

  it("prefers the path when a snapshot somehow carries both", async () => {
    renderWithProviders(
      <BrandLogo source={{ logo: "data:image/png;base64,aGk=", logoPath: "b1/abc.png" }} name="Acme" />
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Acme" })).toHaveAttribute(
        "src",
        "https://signed.test/b1/abc.png"
      )
    );
  });

  it("falls back to the initial when there is no logo at all", () => {
    renderWithProviders(<BrandLogo source={{}} name="acme" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the initial rather than a broken image when signing fails", async () => {
    const { failNext } = await import("@/test/fake-seam");
    failNext("getLogoUrl", "signing failed");
    renderWithProviders(<BrandLogo source={{ logoPath: "b1/abc.png" }} name="Acme" />);

    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses ? when the name is empty", () => {
    renderWithProviders(<BrandLogo source={{}} name="  " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- brand-logo`
Expected: FAIL — cannot resolve `./brand-logo`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-logo-src.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import * as storage from "@/lib/storage";
import { queryKeys } from "@/lib/query-client";

/**
 * A logo lives in one of two shapes and always will: base64 on records
 * written before Storage, and an object path after. The §11 importer keeps
 * bringing base64 snapshots in indefinitely, so this is not a migration
 * window — see spec §8.2.
 */
export interface LogoSource {
  logo?: string;
  logoPath?: string;
}

/**
 * Refetch comfortably before `LOGO_URL_TTL_SECONDS` so a URL never expires
 * while it is on screen.
 */
const LOGO_URL_STALE_MS = (storage.LOGO_URL_TTL_SECONDS - 600) * 1000;

/**
 * Resolves either shape to something an `<img>` can use, or `undefined`
 * while a signed URL is in flight or if signing failed. Callers render their
 * fallback for `undefined` — a broken image is worse than an initial.
 */
export function useLogoSrc(source: LogoSource): string | undefined {
  const path = source.logoPath;

  const { data } = useQuery({
    queryKey: queryKeys.logoUrl(path ?? ""),
    queryFn: () => storage.getLogoUrl(path!),
    enabled: !!path,
    staleTime: LOGO_URL_STALE_MS,
  });

  // The path wins when both are present. A snapshot carrying both would mean
  // the base64 is the older of the two.
  return path ? data : source.logo;
}
```

- [ ] **Step 4: Implement the component**

Create `src/components/brands/brand-logo.tsx`:

```tsx
"use client";

import { useLogoSrc, type LogoSource } from "@/hooks/use-logo-src";

interface BrandLogoProps {
  source: LogoSource;
  /** Used as the image's alt text and as the source of the fallback initial. */
  name: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * The logo-or-initial pair, in one place.
 *
 * Both invoice designs rendered this themselves, with the same fallback
 * markup at different sizes — four copies of a branch that now has to
 * understand two logo shapes. The sizing stays per-design via `className`.
 */
export function BrandLogo({ source, name, className, fallbackClassName }: BrandLogoProps) {
  const src = useLogoSrc(source);

  if (src) {
    // CORRECTED DURING EXECUTION — no inline eslint-disable. This repo
    // suppresses `@next/next/no-img-element` through a `files:` list in
    // `eslint.config.mjs`, whose own comment says inline disables are not
    // used here. Add `brand-logo.tsx` to that list, and remove the two
    // preview files from it — after this refactor neither contains an
    // `<img>` and their entries are dead.
    return <img src={src} alt={name} className={className} />;
  }

  return (
    <div className={fallbackClassName} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- brand-logo`
Expected: PASS, all six.

- [ ] **Step 6: Route both previews through it**

In `src/components/invoices/designs/modern-invoice-preview.tsx`, replace the `snapshot.logo ? … : …` block with:

```tsx
          <BrandLogo
            source={snapshot}
            name={snapshot.name}
            className="w-8 h-8 rounded-lg object-contain shrink-0"
            fallbackClassName="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0"
          />
```

In `classic-invoice-preview.tsx`, the same with that file's classes:

```tsx
          <BrandLogo
            source={snapshot}
            name={snapshot.name}
            className="h-10 w-10 object-contain"
            fallbackClassName="h-10 w-10 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0"
          />
```

- [ ] **Step 7: Run the existing preview tests**

Run: `npm test -- invoice-preview classic-invoice-preview`
Expected: PASS **unmodified**. These files already assert the logo and the initial fallback; if a test needs editing, the refactor changed rendering and the change is wrong.

- [ ] **Step 8: Full suite, then commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/hooks/use-logo-src.ts src/components
git commit -m "feat(ui): resolve logos through one component, base64 or path"
```

---

## Task 4: PDFs resolve the logo before rendering

**Files:**
- Modify: `src/app/(app)/invoices/[id]/pdf-download-button.tsx`
- Test: `src/app/(app)/invoices/[id]/pdf-download-button.test.tsx` (create)

**Interfaces:**
- Consumes: `storage.getLogoUrl` (Task 2).
- Produces: nothing later tasks depend on.

**Why here and not in the PDF components.** `pdf-download-button.tsx` is the only call site of `pdf()`. Resolving the logo there and handing the two design components a snapshot whose `logo` is already a data URL means **neither PDF component changes at all** — they keep reading `snapshot.logo`. `@react-pdf/renderer` cannot await inside a render.

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/invoices/[id]/pdf-download-button.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDownloadButton } from "./pdf-download-button";
import { resetFakeSeam } from "@/test/fake-seam";
import { makeInvoice, makeSnapshot } from "@/test/factories";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

const toBlob = vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" }));
const pdf = vi.fn(() => ({ toBlob }));
vi.mock("@react-pdf/renderer", () => ({ pdf: (...args: unknown[]) => pdf(...args) }));

function snapshotHandedToPdf() {
  const element = pdf.mock.calls[0][0] as { props: { snapshot: { logo?: string } } };
  return element.props.snapshot;
}

describe("PDFDownloadButton", () => {
  beforeEach(() => {
    resetFakeSeam();
    pdf.mockClear();
    global.URL.createObjectURL = vi.fn(() => "blob:x");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("fetches a path-backed logo and hands the PDF a data URL", async () => {
    global.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const snapshot = makeSnapshot({ logoPath: "b1/abc.png" });

    render(<PDFDownloadButton invoice={makeInvoice()} snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(snapshotHandedToPdf().logo).toMatch(/^data:image\/png;base64,/);
  });

  it("passes a legacy base64 snapshot straight through", async () => {
    global.fetch = vi.fn();
    const snapshot = makeSnapshot({ logo: "data:image/png;base64,aGk=" });

    render(<PDFDownloadButton invoice={makeInvoice()} snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(snapshotHandedToPdf().logo).toBe("data:image/png;base64,aGk=");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // The failure mode is a logo missing from a document already sent. The PDF
  // must still generate.
  it("still generates the PDF when the logo cannot be fetched", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network");
    });

    render(
      <PDFDownloadButton invoice={makeInvoice()} snapshot={makeSnapshot({ logoPath: "b1/abc.png" })} />
    );
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(pdf).toHaveBeenCalled();
    expect(snapshotHandedToPdf().logo).toBeUndefined();
  });
});
```

If `src/test/factories.ts` has no `makeSnapshot`, add one there beside the existing factories rather than defining fixtures inline.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- pdf-download-button`
Expected: FAIL — the snapshot handed to `pdf()` still has `logo: undefined` in the first case.

- [ ] **Step 3: Implement**

In `pdf-download-button.tsx`:

```tsx
import * as storage from "@/lib/storage";
import { toast } from "sonner";

/**
 * `@react-pdf/renderer` embeds `snapshot.logo` synchronously and cannot
 * await inside a render, so a path-backed logo has to become a data URL
 * before `pdf()` is called. This is the only `pdf()` call site, which is why
 * it happens here and neither design component changes.
 *
 * A failure here must not fail the download: the logo is missing from a
 * document the client may already have seen, which is bad, but no PDF at all
 * is worse.
 */
async function withResolvedLogo(snapshot: BrandSnapshot): Promise<BrandSnapshot> {
  if (!snapshot.logoPath) return snapshot;

  try {
    const url = await storage.getLogoUrl(snapshot.logoPath);
    const response = await fetch(url);
    if (!response.ok) return { ...snapshot, logo: undefined };

    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { ...snapshot, logo: `data:image/png;base64,${btoa(binary)}` };
  } catch {
    return { ...snapshot, logo: undefined };
  }
}
```

and in `handleDownload`:

```tsx
      const printable = await withResolvedLogo(snapshot);
      const blob = await pdf(<InvoicePDF invoice={invoice} snapshot={printable} />).toBlob();
```

Replace the bare `alert(...)` in the `catch` with `toast("Failed to generate PDF. Please try again.")` — one of the two stray `alert()` calls `docs/POST-MERGE-NOTES.md` has open, and this task is already editing the line.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- pdf-download-button`
Expected: PASS.

- [ ] **Step 5: Falsify the fallback**

Change `catch { return { ...snapshot, logo: undefined }; }` to `catch { throw new Error("x"); }` and re-run.
Expected: the third test **fails**. If it still passes, it is not proving the PDF survives a logo failure. Restore.

- [ ] **Step 6: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add "src/app/(app)/invoices/[id]" src/test/factories.ts
git commit -m "feat(pdf): resolve Storage logos before rendering the document"
```

---

## Task 5: The brand form and the snapshot

**Files:**
- Modify: `src/lib/migrate.ts` (`snapshotFromBrand`), `src/components/brands/brand-form.tsx`
- Test: `src/lib/migrate.test.ts`, `src/components/brands/brand-form.test.tsx`

**Interfaces:**
- Consumes: `saveBrand`'s upload branch (Task 2), `<BrandLogo>` (Task 3).
- Produces: invoices created from here on carry `brandSnapshot.logoPath`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/migrate.test.ts`:

```ts
  it("snapshotFromBrand carries logoPath", () => {
    const snapshot = snapshotFromBrand({ ...baseBrand, logoPath: "b1/abc.png", logo: undefined });
    expect(snapshot.logoPath).toBe("b1/abc.png");
    expect(snapshot.logo).toBeUndefined();
  });

  it("snapshotFromBrand still carries base64 for a brand that has not re-uploaded", () => {
    const snapshot = snapshotFromBrand({ ...baseBrand, logo: "data:image/png;base64,aGk=" });
    expect(snapshot.logo).toBe("data:image/png;base64,aGk=");
    expect(snapshot.logoPath).toBeUndefined();
  });
```

In `src/components/brands/brand-form.test.tsx`:

```tsx
  it("uploads a newly chosen logo and stores the path, not the bytes", async () => {
    const { uploadBrandLogo, getBrands } = await import("@/test/fake-seam");
    renderWithProviders(<BrandForm />);

    // `downsampleImage` needs a real canvas, which jsdom does not provide —
    // stub it so this test is about the save path, not image decoding. Its
    // own behaviour is covered in `brands.test.ts`.
    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(uploadBrandLogo).toHaveBeenCalled());
    const [saved] = await getBrands();
    expect(saved.logoPath).toBeTruthy();
    expect(saved.logo).toBeUndefined();
  });

  it("keeps the form usable when the upload fails, rather than losing the brand", async () => {
    const { failNext } = await import("@/test/fake-seam");
    failNext("uploadBrandLogo", "upload failed");
    renderWithProviders(<BrandForm />);

    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
```

Read the existing `brand-form.test.tsx` first — it already has helpers for filling the form; extend them rather than duplicating. `chooseLogo` stubs `downsampleImage` and fires the file input change.

- [ ] **Step 2: Run to verify both fail**

Run: `npm test -- migrate brand-form`
Expected: FAIL — `snapshotFromBrand` drops `logoPath`; the form's saved brand still carries base64.

- [ ] **Step 3: Implement**

In `snapshotFromBrand` (`src/lib/migrate.ts`), beside `logo`:

```ts
    logo: brand.logo,
    logoPath: brand.logoPath,
```

In `brand-form.tsx`, add `logoPath` to `draftBrand` so the live preview and the save path cannot disagree — the comment above `draftBrand` already promises that property:

```ts
    logo: logo || undefined,
    // Carried so the preview resolves an existing Storage logo. Replaced by
    // `saveBrand` when `logo` above is a fresh data URL.
    logoPath: logo ? brand?.logoPath : undefined,
```

The form keeps **two** pieces of state, not one with a sentinel — the two mean different things and collapsing them is what makes "removed the logo" indistinguishable from "kept the existing one":

```ts
  // A data URL, set only by a NEW upload in this session.
  const [logo, setLogo] = useState(brand?.logo ?? "");
  // The already-stored object, until a new upload replaces it.
  const [logoPath, setLogoPath] = useState(brand?.logoPath);
```

`handleLogoChange` sets both, because a new upload supersedes the stored object:

```ts
      const dataUrl = await downsampleImage(file);
      setLogo(dataUrl);
      setLogoPath(undefined);
```

`handleRemoveLogo` clears both, which is what makes `brandToRow` write `null` to each column and actually remove the logo:

```ts
  const handleRemoveLogo = () => {
    setLogo("");
    setLogoPath(undefined);
  };
```

and `draftBrand` reads them straight:

```ts
    logo: logo || undefined,
    logoPath,
```

Render the form's own logo preview through `<BrandLogo source={{ logo, logoPath }} name={name} … />` so it handles both shapes like everything else.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- migrate brand-form`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

```bash
npm test && npm run test:integration && npx tsc --noEmit && npm run lint
git add src/lib/migrate.ts src/components/brands src/lib/migrate.test.ts
git commit -m "feat(brands): upload logos on save and freeze the path onto snapshots"
```

---

## Task 6: Lift the import pipeline out of the dialog

**Files:**
- Create: `src/lib/import-pipeline.ts`
- Modify: `src/components/invoices/import-export.tsx`

**Interfaces:**
- Consumes: `validateImportedBackup`, `migrateToV2`, `remapNonUuidIds` — all existing.
- Produces:
  - `type ImportCollections = { brands: Brand[]; clients: Client[]; templates: EmailTemplate[]; invoices: Invoice[] }`
  - `prepareImport(parsed: unknown): { ok: false; error: string } | { ok: true; collections: ImportCollections; remappedIds: number }`
  - `writeImport(collections, options): Promise<ImportSummary>`

**This task changes no behaviour.** Every existing test in `import-export.test.tsx` must pass **unmodified**. A test that needs editing is evidence the refactor broke something.

- [ ] **Step 1: Read the current pipeline**

Read `src/components/invoices/import-export.tsx` end to end. Identify exactly which parts are (a) dialog and conflict-resolution state, (b) the pure validate → normalise → default-currency → remap sequence, and (c) the write loop and its per-record accounting.

- [ ] **Step 2: Create `src/lib/import-pipeline.ts`**

It must export exactly this surface — Task 8 is written against these names and types:

```ts
export interface ImportCollections {
  brands: Brand[];
  clients: Client[];
  templates: EmailTemplate[];
  invoices: Invoice[];
}

/** Per-record accounting. Moved verbatim from `import-export.tsx`. */
export interface ImportSummary {
  brands: { added: number; updated: number; failed: number };
  clients: { added: number; updated: number; failed: number };
  templates: { added: number; updated: number; failed: number };
  invoices: { added: number; updated: number; failed: number };
  remappedIds: number;
}

/**
 * Synchronous: validate → migrateToV2 normalise → default `currency` →
 * remap non-uuid ids. No writes, so a caller can show the user what will
 * happen before anything is sent.
 */
export function prepareImport(
  parsed: unknown
): { ok: false; error: string } | { ok: true; collections: ImportCollections; remappedIds: number };

/**
 * Writes through the seam. NOT atomic — see `docs/PHASE3-CARRYOVER.md` for
 * why per-record accounting was chosen over a transaction that only spans
 * the no-conflict case.
 */
export function writeImport(
  collections: ImportCollections,
  options: { remappedIds: number; onConflict?: ConflictResolver }
): Promise<ImportSummary>;
```

Keep `ConflictResolver` exactly as `import-export.tsx` declares it today. The prompt in Task 8 omits `onConflict`, which must mean "no conflicts expected, treat a collision as an update" — the same default the file importer uses when the user has already chosen overwrite.

Move (b) and (c) verbatim. Carry their comments — particularly the two that explain non-obvious decisions:
- why `currency` is defaulted at the import boundary and **not** in the mapper, "where it would quietly paper over a bug in our own code";
- why `migrateToV2`'s default-template seeding is suppressed when the file had no templates.

Move the `remappedIds` handling as-is, including the reason the no-conflict path reads the parameter rather than the React state set moments earlier.

- [ ] **Step 3: Make the component consume it**

`import-export.tsx` keeps `buildBackup`, the dialog, and the conflict UI, and calls `prepareImport` / `writeImport`. No logic moves *into* the component.

- [ ] **Step 4: Run the existing tests unmodified**

Run: `npm test -- import-export import-remap import-validation`
Expected: PASS with **no edits** to any test file. If something fails, the refactor changed behaviour — fix the source, not the test.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/lib/import-pipeline.ts src/components/invoices/import-export.tsx
git commit -m "refactor(import): lift the import pipeline out of the dialog"
```

---

## Task 7: Reading what is on the device

**Files:**
- Create: `src/lib/local-data.ts`, `src/lib/local-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readLocalCollections(): unknown | null` — the raw `invoicer_*` keys assembled into the shape `validateImportedBackup` accepts, or `null` when there is nothing
  - `localInvoiceCount(): number`
  - `isImportPromptDismissed(): boolean`, `dismissImportPrompt(): void`
  - `clearLocalCollections(): void` — added in Task 8, the only writer of a data key in this phase

- [ ] **Step 1: Write the failing test**

Create `src/lib/local-data.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  readLocalCollections,
  localInvoiceCount,
  isImportPromptDismissed,
  dismissImportPrompt,
} from "./local-data";

describe("local-data", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when the device has nothing", () => {
    expect(readLocalCollections()).toBeNull();
    expect(localInvoiceCount()).toBe(0);
  });

  it("assembles the invoicer_* keys into one payload", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([{ id: "b1" }]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }, { id: "i2" }]));

    expect(readLocalCollections()).toEqual({
      brands: [{ id: "b1" }],
      clients: [],
      templates: [],
      invoices: [{ id: "i1" }, { id: "i2" }],
    });
    expect(localInvoiceCount()).toBe(2);
  });

  it("returns null when every key is present but empty", () => {
    for (const key of ["brands", "clients", "templates", "invoices"]) {
      localStorage.setItem(`invoicer_${key}`, "[]");
    }
    expect(readLocalCollections()).toBeNull();
  });

  it("survives corrupt JSON rather than throwing on mount", () => {
    localStorage.setItem("invoicer_brands", "{not json");
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));

    expect(readLocalCollections()).toEqual({
      brands: [],
      clients: [],
      templates: [],
      invoices: [{ id: "i1" }],
    });
  });

  it("ignores a key holding a non-array", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify({ id: "b1" }));
    expect(readLocalCollections()).toBeNull();
  });

  it("remembers dismissal without touching the data keys", () => {
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));
    expect(isImportPromptDismissed()).toBe(false);

    dismissImportPrompt();

    expect(isImportPromptDismissed()).toBe(true);
    expect(localStorage.getItem("invoicer_invoices")).toBe(JSON.stringify([{ id: "i1" }]));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- local-data`
Expected: FAIL — cannot resolve `./local-data`.

- [ ] **Step 3: Implement**

```ts
/**
 * Reads what the local-only build left on this device.
 *
 * READ ONLY. Phase 2 removed the migration-on-mount because it rewrote a
 * user's local data before they had chosen to bring it into their account —
 * for anyone still on the old build that is their only copy. Nothing here
 * writes an `invoicer_*` data key, and the dismissal flag below is a
 * separate key of its own.
 */

const KEYS = {
  brands: "invoicer_brands",
  clients: "invoicer_clients",
  templates: "invoicer_templates",
  invoices: "invoicer_invoices",
} as const;

const DISMISSED_KEY = "invoicer_import_prompt";

/**
 * Never throws. This runs on mount for every signed-in user, and a corrupt
 * key on one collection must not take the app down — the importer's
 * validation is what reports bad data, in a dialog, where it can be read.
 */
function readArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLocalCollections(): {
  brands: unknown[];
  clients: unknown[];
  templates: unknown[];
  invoices: unknown[];
} | null {
  const collections = {
    brands: readArray(KEYS.brands),
    clients: readArray(KEYS.clients),
    templates: readArray(KEYS.templates),
    invoices: readArray(KEYS.invoices),
  };

  const total = Object.values(collections).reduce((sum, list) => sum + list.length, 0);
  return total === 0 ? null : collections;
}

/** Drives the prompt's copy — "We found 14 invoices on this device." */
export function localInvoiceCount(): number {
  return readArray(KEYS.invoices).length;
}

/**
 * Dismissal is local, not a database flag. The prompt is about THIS device's
 * data: a second browser holding different local data is exactly the case
 * where asking again is right, and a server-side flag would silently
 * suppress it there.
 */
export function isImportPromptDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISSED_KEY) === "dismissed";
}

export function dismissImportPrompt(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, "dismissed");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- local-data`
Expected: PASS, all six.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/lib/local-data.ts src/lib/local-data.test.ts
git commit -m "feat(import): read the local-only build's data without writing it"
```

---

## Task 8: The prompt

**Files:**
- Create: `src/components/import/local-import-prompt.tsx`, `src/components/import/local-import-prompt.test.tsx`
- Modify: `src/components/layout/shell.tsx`

**Interfaces:**
- Consumes: `readLocalCollections`, `localInvoiceCount`, `isImportPromptDismissed`, `dismissImportPrompt` (Task 7); `prepareImport`, `writeImport` (Task 6).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `src/components/import/local-import-prompt.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { LocalImportPrompt } from "./local-import-prompt";
import { resetFakeSeam } from "@/test/fake-seam";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

function seedLocal(invoiceCount: number) {
  localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
  localStorage.setItem(
    "invoicer_invoices",
    JSON.stringify(Array.from({ length: invoiceCount }, (_, i) => validInvoice(`i${i}`)))
  );
}

describe("LocalImportPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFakeSeam();
  });

  it("says nothing when the device has no local data", () => {
    renderWithProviders(<LocalImportPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports the invoice count it found", async () => {
    seedLocal(14);
    renderWithProviders(<LocalImportPrompt />);
    expect(await screen.findByText(/14 invoices on this device/i)).toBeInTheDocument();
  });

  it("imports into the account when accepted", async () => {
    seedLocal(2);
    const { getInvoices } = await import("@/test/fake-seam");
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));

    await waitFor(async () => expect(await getInvoices()).toHaveLength(2));
  });

  // The load-bearing one.
  it("never deletes the local copy, even after a successful import", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByText(/imported/i);

    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(2);
  });

  it("offers to clear the local copy only after the result is on screen", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByText(/imported/i);

    expect(screen.getByRole("button", { name: /clear local copy/i })).toBeInTheDocument();
  });

  it("stays dismissed across a remount", async () => {
    seedLocal(2);
    const { unmount } = renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /not now/i }));
    unmount();
    renderWithProviders(<LocalImportPrompt />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the local copy when the import fails", async () => {
    seedLocal(2);
    const { failNext } = await import("@/test/fake-seam");
    failNext("createInvoice", "network down");
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));

    await screen.findByText(/could not|failed/i);
    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();
  });
});
```

`validBrand()` / `validInvoice(id)` must produce records that pass `validateImportedBackup` — reuse the fixtures `import-export.test.tsx` already defines, moving them to `src/test/factories.ts` if they are local to that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- local-import-prompt`
Expected: FAIL — cannot resolve `./local-import-prompt`.

- [ ] **Step 3: Implement the component**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { prepareImport, writeImport, type ImportSummary } from "@/lib/import-pipeline";
import {
  readLocalCollections,
  localInvoiceCount,
  isImportPromptDismissed,
  dismissImportPrompt,
  clearLocalCollections,
} from "@/lib/local-data";

type Stage =
  | { name: "asking" }
  | { name: "importing" }
  | { name: "done"; summary: ImportSummary }
  | { name: "failed"; error: string };

export function LocalImportPrompt() {
  /**
   * Read ONCE, in an initialiser. Re-reading on every render means clearing
   * the local copy re-evaluates `hasLocal` mid-interaction and the dialog
   * disappears while the user is still reading their import summary.
   */
  const [initial] = useState(() => ({
    collections: readLocalCollections(),
    count: localInvoiceCount(),
    dismissed: isImportPromptDismissed(),
  }));

  const [stage, setStage] = useState<Stage>({ name: "asking" });
  const [open, setOpen] = useState(true);
  const [cleared, setCleared] = useState(false);

  if (!initial.collections || initial.dismissed) return null;

  const handleImport = async () => {
    setStage({ name: "importing" });

    const prepared = prepareImport(initial.collections);
    if (!prepared.ok) {
      setStage({ name: "failed", error: prepared.error });
      return;
    }

    try {
      const summary = await writeImport(prepared.collections, {
        remappedIds: prepared.remappedIds,
      });
      setStage({ name: "done", summary });
    } catch (err) {
      setStage({ name: "failed", error: err instanceof Error ? err.message : "Import failed" });
    }
  };

  const handleNotNow = () => {
    dismissImportPrompt();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleNotNow()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {stage.name === "done" ? "Imported" : `We found ${initial.count} invoices on this device`}
          </DialogTitle>
        </DialogHeader>

        {stage.name === "asking" && (
          <p className="text-sm text-muted-foreground">
            They were saved by the earlier version of Invoicer, which kept everything in this
            browser. Import them into your account? Your local copy stays where it is either way.
          </p>
        )}

        {stage.name === "failed" && (
          <p className="text-sm text-destructive">
            {stage.error} — nothing on this device was changed, so you can try again.
          </p>
        )}

        {stage.name === "done" && (
          <ImportSummaryView summary={stage.summary} />
        )}

        <DialogFooter>
          {stage.name === "asking" && (
            <>
              <Button variant="ghost" onClick={handleNotNow}>
                Not now
              </Button>
              <Button onClick={handleImport}>Import them</Button>
            </>
          )}

          {stage.name === "importing" && <Button disabled>Importing…</Button>}

          {/* Only offered once the result is on screen. Deleting someone's
              only copy on the strength of an upload nobody has looked at is
              not a risk worth taking (spec §11). */}
          {stage.name === "done" && !cleared && (
            <Button
              variant="outline"
              onClick={() => {
                clearLocalCollections();
                setCleared(true);
              }}
            >
              Clear local copy
            </Button>
          )}

          {stage.name !== "asking" && stage.name !== "importing" && (
            <Button onClick={handleNotNow}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`ImportSummaryView` is the per-record summary the file importer already renders, including the remapped-ids notice. Lift it out of `import-export.tsx` alongside the pipeline in Task 6 rather than writing a second one — if Task 6 left it in the component, move it now.

Add `clearLocalCollections()` to `src/lib/local-data.ts`, the **only** function in this phase that writes an `invoicer_*` data key:

```ts
/**
 * Removes the local-only build's data. Called from exactly one place: the
 * button the user presses AFTER seeing what was imported. Never automatic,
 * never on success — see spec §11.
 */
export function clearLocalCollections(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- local-import-prompt`
Expected: PASS, all seven.

- [ ] **Step 5: Falsify the "never deletes" test**

Add a `localStorage.removeItem("invoicer_invoices")` to the success path and re-run.
Expected: the "never deletes the local copy" test **fails**. If it passes, it is not watching the thing it names. Remove the line.

- [ ] **Step 6: Mount it**

In `src/components/layout/shell.tsx`, render `<LocalImportPrompt />` inside the shell. It renders nothing when there is no local data, so it costs one `localStorage` read on mount.

Add a test to the existing shell test file asserting the shell renders without a prompt when `localStorage` is empty — the case every current user is in.

- [ ] **Step 7: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add src/components
git commit -m "feat(import): one-time prompt to bring local data into the account"
```

---

## Task 9: Docs and carry-over

**Files:**
- Modify: `README.md`
- Create: `docs/PHASE4-CARRYOVER.md`
- Delete: `docs/PHASE3-CARRYOVER.md` (its open items move forward; a doc about a finished phase should not be the place they live)

- [ ] **Step 1: Update the README**

The "Moving from the local-only version" section currently describes exporting a backup and importing it by hand. Replace with the prompt, and keep the re-import duplication caveat.

- [ ] **Step 2: Write `docs/PHASE4-CARRYOVER.md`**

Carry forward everything still open from `PHASE3-CARRYOVER.md` — the production-unsafe `config.toml`, the Sentry wiring for `getClaims()`, the `pg_default_acl` note, org-orphaning on user delete, the import limitations, and the polish list — plus what this phase adds:

- **`brands.logo_data` is not dropped.** Brands whose owner has not re-uploaded since still render from it. Dropping it needs either a backfill or accepting that those logos disappear.
- **Objects are never deleted** (Decision 3), so the bucket grows with distinct images. DPDP erasure must list an org's brands and delete per brand, because the path is no longer prefixed by `org_id` (§8.1).
- **No test covers a signed URL actually expiring.** `LOGO_URL_STALE_MS` is reasoned about, not proven.
- **`Brand.nextInvoiceNumber` is still dead** — untouched again this phase.

- [ ] **Step 3: Commit**

```bash
git add README.md docs
git rm docs/PHASE3-CARRYOVER.md
git commit -m "docs: record Phase 3 carry-over for Phase 4"
```

---

## Done when

- Uploading a logo writes an object and stores a path; `brands.logo_data` stops growing.
- A second user holding another user's brand UUID can neither read nor write objects under it, **proven by a test that fails when the policy is loosened**.
- Both invoice designs and both PDF designs render a logo from either shape.
- A PDF still generates when the logo cannot be fetched.
- A user with `invoicer_*` keys is offered a one-time import, and their local data is still there afterwards.
- 528+ unit tests and 102+ integration tests pass; tsc, lint, build and advisors clean.
- A fresh carry-over doc records what this phase defers.

## Explicitly NOT in this plan

- **Dropping `brands.logo_data`.** It is still the only source for brands whose logo predates Storage.
- **Backfilling legacy `brand_snapshot` logos.** Spec §8.2: the dual path is permanent regardless, so a backfill buys nothing.
- **Deleting orphaned objects.** Decision 3.
- **Landing page, SEO, `metadataBase`, PostHog, Sentry.** Spec §12, next phase.
- **DPDP consent/export/delete, privacy and terms.** Spec §15, the launch-gate phase.
- **The `config.toml` production gate.** Carried since Phase 1; it belongs to the deploy checklist, not here.

## Found during execution

### Task 1 — the policy SQL above was wrong, and the guard test was vacuous

**`name` inside the subquery resolved to the wrong table.** As originally written, `where b.id::text = (storage.foldername(name))[1]` sits inside `select 1 from public.brands b`, and `brands` has its own `name` column — so the unqualified reference bound to the brand's *display name*, not the object path. Confirmed by inspecting `pg_policies.qual`, which showed `storage.foldername(b.name)`. Fixed by qualifying `objects.name`; the SQL above has been corrected in place so nobody copies the broken version.

It would have failed *closed*, so the happy-path tests would have caught it. That is luck, not design.

**The `not-a-uuid` test could not have caught what it was named for.** `expect(JSON.stringify(error)).not.toContain("22P02")` still passed 8/8 with the `::uuid` cast reintroduced — the SQLSTATE never reaches the client in a form that assertion can see. Replaced with a `StorageApiError#code` check distinguishing `AccessDenied` from `InvalidParameter`, verified to fail with the cast and pass without it.

This is why Step 5 exists, and it is worth noting Step 5 as written was *also* insufficient: it only falsified the SELECT policy, so this test slipped through and was caught by the reviewer instead. **When a task adds N guards, falsify N guards, not the one the plan happened to name.**

**A `storage.buckets` SELECT policy was added, then removed.** `storage.buckets` ships with RLS on and zero policies, so `getBucket()` 404s for everyone — including legitimate owners. The implementer added a narrowly-scoped policy to make the "bucket exists and is private" test pass. Removed on review: no application path needs bucket SELECT (`upload`, `createSignedUrl` and `list` all work without it), so it was production security surface existing only to satisfy a test. The test now asserts the property that actually matters — an object is not readable without a signature — falsified by flipping the bucket public.

**`src/test/integration/helpers.ts` exports `makeUser()`**, returning `{ client, userId, orgId, email }`. The `signInAsNewUser`/`serviceClient` names used in Task 1's test code do not exist. Later tasks referencing integration helpers should check the real exports first.

### Task 2 — the upload ordering above was wrong, and a fourth test was vacuous

**Upload-before-write is denied by RLS.** Task 1's INSERT policy requires the brand row to exist, and brand ids are generated client-side, so creating a brand with a logo failed every time. Unlike Task 1's bug this one would have shipped visibly broken. The ordering above is corrected in place.

**The fix costs atomicity, and that is now pinned rather than assumed.** A failure after the first upsert leaves the row committed — including unrelated fields edited in the same save — while `saveBrand` rejects. An integration test forces an upload failure against real Postgres and asserts the row persisted, `phone` survived, and `logo_data` still holds the base64. `saveBrand` carries a comment explaining why a single upsert cannot be restored.

**The idempotence test could not fail.** `expect(second.logoPath).toBe(first.logoPath)` passes when both are `undefined`, so it was green even with the upload removed entirely. Fixed by asserting `first.logoPath` matches `/\.png$/` before comparing.

It was found only because the fix round re-ran the falsification probe across **all** tests that depend on the upload firing. The previous round's probe reported "3 failing tests" when six depend on it, and that mismatch was the tell — accepting a probe without checking the count against what should have failed is how the vacuous test survived a round.

**Running total: four tests in this project have passed for the wrong reason.** Every one was found by breaking the code, none by reading the test.

### Task 3 — "must pass unmodified" needed one exception, and a fifth vacuous test

**The two preview test files did need editing, but not their assertions.** Wiring `BrandLogo` in crashed all 16 of their tests with the identical `No QueryClient set`, because they use plain `render` and the component now reads through `useQuery`. The implementer escalated rather than editing, which was right.

Ruled: swap to `renderWithProviders`. The constraint targets **assertions** — an assertion needing to change would have proven the rendering changed. Nothing became asynchronous, because a base64 snapshot leaves `logoPath` unset and `useLogoSrc` returns `source.logo` without enabling the query. The edit was fenced to imports and the render call, with `await`/`waitFor`/`findBy*` forbidden as a tripwire: if any had been needed, the ruling would not have held.

**A fifth test could not fail, and the mechanism generalises.** The "shows the initial rather than a broken image when signing fails" test passed even with the error path broken, because `waitFor` evaluates its condition **synchronously first** and the fallback initial renders identically during loading and after an error — so the assertion was satisfied before the rejection could be observed. Fixed by awaiting the mocked rejection before asserting.

**Any test asserting a post-failure state that looks like its loading state has this bug.** That is a shape to check for, not an incident that was closed.

**The plan's `brand-logo.tsx` snippet specified an inline `eslint-disable`** in a repo whose `eslint.config.mjs` explicitly says it does not use them. Corrected above. Note the follow-on: Task 5 routes the brand form's preview through `BrandLogo`, which makes `brand-form.tsx`'s entry in that `files:` list dead the same way the preview entries became dead. **Re-check that list in Task 5.**
