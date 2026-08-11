# Phase 1 carry-over — read before starting Phase 2

Written at the end of the SaaS Phase 1 branch (`feat/saas-phase1-auth`, 22 commits, 472 unit +
42 integration tests). Everything here was found during execution, consciously deferred, and
triaged by the whole-branch review. None of it blocked the merge; none of it should be
forgotten either.

Phase 1 delivered the foundation only: Supabase Postgres with tenancy and RLS, plus real
authentication around the existing app. **The app still reads and writes `localStorage`** —
moving data to Postgres is Phase 2. See
`docs/superpowers/specs/2026-08-11-saas-foundation-design.md` for the full design.

---

## Do this first in Phase 2

### 1. ~~Fold `org_id` into the invoice unique constraints, with a same-org FK check~~ — fixed

**Status: fixed**, in migration `20260811183756_same_org_invoice_refs.sql`, by composite
foreign keys — not the same-org check trigger originally recommended below.

The gap: both unique constraints keyed on `brand_id` alone, and **foreign-key checks bypass
RLS** — nothing stopped a tenant setting `invoices.brand_id` (or `client_id`) to a UUID
belonging to another org. Because the unique keys omitted `org_id`, that tenant could insert
rows under *their own* `org_id` carrying the victim's `brand_id` and squat `(brand_id,
number_year, number_seq)` — making the victim's `create_invoice` RPC collide with `23505` or
silently skip numbers. That was cross-tenant **write interference**, not merely an incoherent
record.

The fix, in order:
- `public.brands` and `public.clients` each got a `unique (org_id, id)` constraint, so
  `(org_id, id)` can be an FK target.
- `invoices_brand_id_fkey` and `invoices_client_id_fkey` were dropped and re-added as composite
  FKs: `foreign key (org_id, brand_id) references brands (org_id, id)` (still `on delete
  restrict`) and `foreign key (org_id, client_id) references clients (org_id, id) on delete set
  null (client_id)`.
- `invoices_number_unique` and `invoices_seq_unique` now include `org_id`:
  `unique (org_id, brand_id, invoice_number)` and `unique (org_id, brand_id, number_year,
  number_seq)`.
- `invoices_brand_id_idx` / `invoices_client_id_idx` were replaced with composite
  `invoices_org_brand_idx` / `invoices_org_client_idx` to index the new composite FKs (Postgres
  does not index the referencing side of an FK automatically).

**Why a composite FK instead of a trigger:** a same-org check trigger runs application logic
that has to be trusted to fire on every insert/update and could be disabled, dropped, or
bypassed by any code path with elevated privileges. A composite FK is enforced by the FK
machinery itself — it cannot be bypassed, needs no elevated privileges, and has no RLS
interaction, since the FK check runs against the referenced table's raw rows regardless of RLS
either way. This was workable because the referenced table (`brands`/`clients`) already carries
`org_id`, so `(org_id, id)` composes into a real unique key; and because this database is
PostgreSQL 17.6, `on delete set null (column_list)` (PG15+) is available, which is essential
here — without it, `on delete set null` on a composite FK nulls *every* referencing column,
including `org_id`, which is `not null`, so deleting a client would error instead of detaching
its invoices.

### 2. The numbering RPC depends on the constraint above

`src/lib/numbering.ts` currently picks the next number with a client-side `max()` scan, which
issues duplicate invoice numbers across two tabs or two devices. The design moves allocation
into a transactional `create_invoice` RPC with the unique constraint as its hard backstop. Item
1 above is now fixed — the backstop is correct — so this can proceed.

---

## Test gaps worth closing

- **No test asserts `TRUNCATE` is absent for the `authenticated` role.**
  `src/test/integration/anon-grants.test.ts` queries `grantee = 'anon'` only. The live state was
  verified clean for both roles at merge, but a regression affecting `authenticated` alone would
  pass the suite. Extend the query to cover both roles.
- **A "grants mirror policies" assertion would be more valuable than either.** A query joining
  `information_schema.role_table_grants` against `pg_policies`, failing when a role holds a
  privilege with no matching policy, would have caught the `TRUNCATE` gap automatically and keeps
  catching it as tables are added.

---

## Architecture

- **Hoist `Shell` into `src/app/(app)/layout.tsx`.** Every page currently wraps itself in
  `<Shell>`, so the sidebar unmounts and remounts on every in-app navigation. Threading the user
  through `SessionProvider` removed the visible symptom (a placeholder flash), but the remount
  remains. This matters more once Phase 2 makes the data layer async — a persisted shell keeps
  the query cache and sidebar state alive across navigation. Deferred because it touches every
  page component.

---

## Operational

- **Wire the proxy's `getClaims()` catch to Sentry** when Phase 3 adds it
  (`src/lib/supabase/proxy.ts`). It currently `console.warn`s and fails closed, so a JWKS outage
  logs every user out with only a console line as signal.
- **`supabase/config.toml` is production-unsafe as committed.** `enable_signup = true` with
  `enable_confirmations = false` is correct locally — it is what lets the integration tests use
  `signInWithPassword` — but the CLI pushes this file verbatim. On a hosted project it would let
  anyone self-register an arbitrary email, pre-confirmed, while the product's stated auth surface
  is magic link + Google only. A warning sits above the setting; **the deploy checklist must gate
  it.**
- **`pg_default_acl` retains a second entry owned by `supabase_admin`** granting
  `TRUNCATE/REFERENCES/TRIGGER` to `anon`/`authenticated` on any table that role creates in
  `public`. The Phase 1 revoke covers the `postgres` grantor, which is the one migrations
  actually run as, so this is not reachable through the normal migration path. Worth knowing
  before assuming the revoke is global.

---

## Polish

- `src/lib/supabase/{client,server,proxy}.ts` use `process.env.X!` with no runtime guard, unlike
  `src/test/integration/helpers.ts` which validates and throws a useful message. A missing
  `.env.local` currently fails deep inside the Supabase SDK.
- `vitest.config.ts`'s `exclude` replaces Vitest's default list rather than merging, and
  `node_modules/**` (not `**/node_modules/**`) will not match nested installs. Latent only.
- `src/app/(auth)/login/page.tsx` surfaces raw Supabase error strings via `toast(error.message)`.
  The app's own copy is hand-written, dry and second-person ("Select a brand first"), so provider
  text will read as foreign. Wants a copy pass alongside the real landing page.
- The Google sign-in button has no pending/disabled state, unlike the email form.
- `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts` lists `/pricing`, `/privacy` and `/terms`, which
  do not exist as routes yet. Deliberate — the landing-page plan adds them.
- `src/test/integration/tenancy.test.ts`'s cascade test does not check `deleteUser`'s error or
  assert the membership existed pre-deletion. It still fails correctly without
  `on delete cascade`, so this is strictness, not a hole.

---

## Process note

The plan was amended five times mid-execution as agents found genuine defects in it. Each
amendment patched the task it touched but not the plan's global sections, so three stale
requirements survived to the final review (a File Structure row for a deleted migration, a
migration count, and an obsolete test-count acceptance criterion).

**If a plan gets amended during execution, re-read its Global Constraints and "Done when"
sections before the final gate.**
