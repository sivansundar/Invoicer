# SaaS Phase 2 — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every piece of app data out of `localStorage` and into the Postgres schema Phase 1 built, and fix invoice numbering so two tabs cannot issue the same invoice number.

**Architecture:** `src/lib/storage.ts` keeps every exported function name and becomes async, backed by PostgREST via the browser Supabase client. RLS — already proven in Phase 1 — is the only tenancy filter; no application code passes `org_id` on reads. The five hooks in `src/hooks/` move from `useSyncExternalStore` to TanStack Query, which supplies the caching and cross-component consistency the snapshot cache used to. Invoice creation and update move into transactional RPCs so a multi-row write (invoice + its items) either lands whole or not at all, and so sequence allocation happens under a row lock instead of a client-side `max()`.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript, Supabase (Postgres + PostgREST), `@supabase/ssr`, `@tanstack/react-query` (new), vitest.

**Source spec:** `docs/superpowers/specs/2026-08-11-saas-foundation-design.md` (§9, §10, and Phases 3–4 of §16), plus `docs/PHASE2-CARRYOVER.md`.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Baseline.** Branch `feat/saas-phase2-data` from `v1` @ `9a0aa98`: **472 unit tests + 42 integration tests passing, clean build, zero lint problems.** Every task must leave all four true. "Lint passes" means the problem count does not go up from zero.

**Verification for every task:** `npx tsc --noEmit` passes, `npm run lint` reports zero problems, `npm test` passes, and — for any task touching SQL or the seam — `npm run test:integration` passes. The build must still show `ƒ Proxy (Middleware)`.

**The seam's contract does not change.** `src/lib/storage.ts` keeps every exported function name. Callers change only by `await`ing. This is what keeps the phase reviewable: a diff that renames seam functions is a diff nobody can check against the old behaviour.

**No `org_id` in application code.** Reads filter by nothing; RLS does it. Writes omit `org_id` and let the column default fill it — see Task 2, which adds that default. Application code that passes `org_id` explicitly is a bug even when it produces the right answer, because it trains the next reader to think the filter lives in TypeScript.

**Money stays exact.** Amounts are `numeric(14,2)` in Postgres and `number` in TypeScript. PostgREST's JSON encoding of `numeric` must be verified by a round-trip integration test (Task 3), not assumed — if it arrives as a string, the mapper converts at the boundary and nowhere else.

**SQL conventions** (unchanged from Phase 1): lowercase identifiers, `numeric(14,2)` for money and never a float type, an index on every foreign key column, no `add constraint if not exists`. Never invent a migration filename — always `supabase migration new <name>`.

**RLS rules** carry over verbatim from the Phase 1 plan's Global Constraints. The two that bite in this phase:
- `security invoker` on the new RPCs, so RLS applies to the caller. A `security definer` RPC here would hand every user every org's invoices.
- A `select` policy must exist wherever an `update` policy does, or the RPC's `returning` clause silently yields zero rows.

**Optimistic updates must roll back.** Every mutation that writes to the cache before the server answers needs an `onError` that restores the previous cache value. A mutation that optimistically shows success and leaves the wrong data on screen after a failure is worse than no optimism at all — the user believes their invoice saved.

**Loading states are part of the task, not a follow-up.** A screen ported to async without a skeleton is not done. Reads used to be synchronous, so the app has almost no loading affordances; every list and detail screen needs one. `skeleton.tsx` is already installed.

**Commits:** one per task, conventional-commit prefix, ending with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Decisions this plan makes

Three things the spec left open that would otherwise be decided ad hoc mid-execution.

### 1. Brand logos get a temporary `logo_data` column

`Brand.logo` is a base64 data URL in `localStorage`. The schema has `logo_path` (a Storage object path), but Storage is a later phase. Cutting over without addressing this silently breaks logo upload — the form would accept a file and drop it.

**Decision:** Task 2 adds `brands.logo_data text` alongside the unused `logo_path`, holding the same base64 the app already produces. The logos phase migrates `logo_data` → Storage and drops the column. A comment on the column says exactly that, so it is not mistaken for the permanent design.

Rejected: shipping with logo upload broken for a phase. It is a visible feature regression on the brand form for no benefit beyond avoiding one reversible column.

Note `brand_snapshot` jsonb already carries `logo` inline, so already-issued invoices keep rendering their logo regardless.

### 2. `PlanState` stays in `localStorage`

`usePlan` is explicitly a MOCK — no billing integration exists, and the whole surface is behind a feature flag that is off. There is no `plan` column and inventing one commits the schema to a billing model the billing spec has not chosen yet.

**Decision:** `savePlan`/`getPlanSnapshot` keep their `localStorage` implementation and stay synchronous. They are the one exception to "no `localStorage`", and Task 10 leaves their code path intact when it deletes the rest.

### 3. Invoice updates need an RPC too, not just creates

The spec specifies `create_invoice` for sequence allocation. It does not address updates — but `saveInvoice` handles both, and an invoice's line items live in a separate table. Updating items over PostgREST means delete-then-insert as two requests: a failure between them leaves an invoice with no line items and a total that no longer matches anything.

**Decision:** Task 4 ships `create_invoice` and `update_invoice` together. `update_invoice` does not touch numbering — a number, once issued, is never reallocated.

---

## File Structure

**New — SQL:**

| File | Responsibility |
|---|---|
| `supabase/migrations/*_org_id_defaults.sql` | `org_id` default from the caller's membership; `brands.logo_data` |
| `supabase/migrations/*_invoice_rpcs.sql` | `create_invoice`, `update_invoice`, both `security invoker` |

**New — TypeScript:**

| File | Responsibility |
|---|---|
| `src/lib/supabase/mappers.ts` | Row ↔ domain-type conversion, both directions, one place |
| `src/lib/supabase/mappers.test.ts` | Round-trip coverage per entity |
| `src/lib/query-client.ts` | `QueryClient` factory and shared query-key constants |
| `src/components/providers/query-provider.tsx` | `QueryClientProvider`, mounted once in `(app)/layout.tsx` |
| `src/components/ui/*-skeleton.tsx` | Per-screen loading states (count settles in Task 7) |
| `src/test/integration/seam.test.ts` | The seam's real behaviour against real Postgres |
| `src/test/integration/rpc.test.ts` | Numbering under concurrency; item atomicity |
| `src/test/msw/` or `src/test/fake-seam.ts` | What unit tests drive instead of `localStorage` (Task 3 picks one) |

**Rewritten:**

| File | Change |
|---|---|
| `src/lib/storage.ts` | Every function async against PostgREST; snapshot cache and `subscribe` deleted |
| `src/hooks/use-brands.ts` | TanStack Query |
| `src/hooks/use-clients.ts` | TanStack Query |
| `src/hooks/use-invoices.ts` | TanStack Query; `save` routes through the RPCs |
| `src/hooks/use-templates.ts` | TanStack Query |
| `src/app/(app)/layout.tsx` | Hosts `QueryProvider` and `Shell` (the carry-over hoist) |
| `src/components/invoices/import-export.tsx` | Backup import/export through the async seam |
| `src/lib/storage.test.ts` | Becomes integration coverage; the unit file shrinks to mapper-level checks |

**Untouched — stated so nobody "helpfully" refactors them:** `money`, `dates`, `numbering`, `chart`, `reports`, `invoice-validation`, `dashboard`, `followups`, `palette`, `invoice-design`, `import-validation`, and every component, form, PDF and preview beyond adding a loading branch. `src/lib/migrate.ts` is **not** deleted — the importer phase reuses it.

---

## Task 1: TanStack Query provider, and hoist `Shell` into the layout

Carry-over item: every page currently wraps itself in `<Shell>`, so the sidebar unmounts on every navigation. That is cosmetic today and load-bearing the moment the data layer is async — a remounting tree throws away the query cache's subscribers on every route change.

Do this first, before anything is async, so the hoist is reviewable on its own.

- [ ] Install `@tanstack/react-query` (pin the exact version, no `^`; commit `package-lock.json`)
- [ ] Write `src/lib/query-client.ts`: a `makeQueryClient()` factory and exported query-key constants (`queryKeys.brands`, `.clients`, `.invoices`, `.templates`). Keys live here, not inline at call sites, so a typo cannot silently create a second cache entry
- [ ] Write `src/components/providers/query-provider.tsx` — client component, one `QueryClient` per browser session, not per render
- [ ] Move `<Shell>` from every page component into `src/app/(app)/layout.tsx`, wrapped in `<QueryProvider>`
- [ ] Delete the now-redundant `<Shell>` wrapper from each `(app)` page
- [ ] Test: navigating between two `(app)` routes does not remount the sidebar (assert a stable DOM node or a mount counter)

**Verification:** all 472 tests still pass, no visual change, sidebar state survives navigation.

**Trap:** a `QueryClient` constructed at module scope is shared across requests on the server and leaks one user's data into another's response. It must be created inside the provider component.

---

## Task 2: `org_id` defaults and the `logo_data` bridge column

- [ ] `supabase migration new org_id_defaults`
- [ ] Add `private.current_org_id()` returning the caller's org id from `org_members` where `user_id = auth.uid()`. Mirror `private.is_org_member` exactly: `security definer`, `set search_path = ''`, `stable`, `execute` revoked from `public, anon, service_role` and granted to `authenticated` only. Phase 1's rationale for that grant shape is commented at `20260811141631_rls_policies.sql:38-62` — follow it rather than restating it
- [ ] The solo-UX assumption (one membership per user) is what makes a scalar return correct. Encode it: `select … into strict` or an explicit `limit 1` with a comment naming the assumption, so the day workspaces arrive this fails loudly instead of picking an arbitrary org
- [ ] Set `default private.current_org_id()` on `org_id` for `brands`, `clients`, `invoices`, `email_templates`
- [ ] Add `brands.logo_data text`, with the comment stating it is a bridge to be dropped when logos move to Storage
- [ ] Integration test: an insert omitting `org_id` lands in the caller's org
- [ ] Integration test: the default cannot be used to write into another org — an explicit `org_id` for a foreign org is still rejected by the existing `with check` policy

**Verification:** `supabase db advisors` clean; `npm run test:integration` passes.

**Trap:** a `default` is evaluated with the inserting role's privileges but is *not* a substitute for the RLS `with check` — it fills a blank, it does not authorize. Both tests above must exist; the second is the one that proves the policy still governs.

**Trap:** `security definer` on this helper means it reads `org_members` with RLS bypassed. That is why the `auth.uid()` filter is inside the function body and not optional — without it the function returns some other user's org and the `default` becomes a cross-tenant write primitive. Phase 1's Global Constraints already require `security definer` functions to check `auth.uid()` internally; this is that rule's most consequential instance in the phase.

---

## Task 3: brands, clients and templates move to Postgres

The three simple entities first, each end-to-end. Invoices wait for the RPCs in Task 4 — porting them together would mix a mechanical translation with a genuine design change in one diff.

> **Amended during execution (2026-08-12).** This task originally stopped at the seam and left every hook on `useSyncExternalStore` until Task 6. That does not compose: `useSyncExternalStore` needs a synchronous snapshot, so deleting `getBrandsSnapshot` forces the hook conversion, and *not* deleting it would leave the app reading `localStorage` while writing to Postgres for several commits. The slice is per entity, not per layer. Task 6 keeps `use-invoices` (which depends on Task 4's RPCs) and the deletion of the cross-tab listener machinery. Per this plan's own process note, Global Constraints and "Done when" were re-read against this change; both still hold.

- [ ] Write `src/lib/supabase/mappers.ts` with `rowToBrand`/`brandToRow`, `rowToClient`/`clientToRow`, `rowToTemplate`/`templateToRow`
- [ ] Mapper unit tests, round-trip per entity. `Brand.nextInvoiceNumber` is dead (POST-MERGE-NOTES) and has no column — assert the mapper drops it rather than silently carrying it
- [ ] **Integration test first:** write a value with each money and date type through the seam and read it back unchanged. This is the check that settles how PostgREST encodes `numeric` — if it returns a string, the mapper converts, and that fact gets a comment
- [ ] Rewrite `getBrands`/`getBrand`/`saveBrand`/`deleteBrand` and the client/template equivalents as `async`, against the browser Supabase client
- [ ] **Test substitute: an in-memory fake of the seam**, injected with `vi.mock("@/lib/storage")` — ruled 2026-08-12 over MSW. MSW would mean hand-writing a PostgREST emulator (filter syntax, embedded selects, `Prefer` headers, RPC endpoints, `23505`/`42501`/`PGRST204` envelopes) whose fidelity is capped by the author's model of PostgREST — a handler returning a shape PostgREST would not produce gives false confidence. The call sites being ported are overwhelmingly fixture setup, not assertions about persistence, and everything the fake skips (mappers, query building, money encoding, RLS) is covered against real Postgres by the integration suite, which already exists and runs in ~3s
- [ ] A test asserting the fake and the real module export identical names, so the fake cannot silently drift after a signature change
- [ ] Convert `use-brands`, `use-clients`, `use-templates` to TanStack Query — forced by this task, see the amendment note above. Keep each hook's return shape so no consumer changes beyond honouring `loading`
- [ ] Port the affected test files (`brand-form.test.tsx`, `client-form.test.tsx`) onto the fake
- [ ] Delete `getBrandsSnapshot`/`getClientsSnapshot`/`getTemplatesSnapshot` and their cache slots

**Verification:** integration suite covers create/read/update/delete per entity; unit suite still passes with no `localStorage` in the ported files.

**Trap:** `save*` currently returns `boolean` (did the write persist). Async, the honest signal is a thrown error, not `false`. Callers like `BrandForm.handleSubmit` check the boolean before navigating — convert them to `try/catch` rather than resolving `false`, or a rejected promise becomes an unhandled rejection and the form navigates away from an unsaved brand.

---

## Task 4: `create_invoice` and `update_invoice`

- [ ] `supabase migration new invoice_rpcs`
- [ ] `create_invoice(payload jsonb) returns public.invoices`, `security invoker`, `language plpgsql`:
  - `select … for update` on the brand row to serialise concurrent creates
  - allocate `number_seq` as `coalesce(max(number_seq), 0) + 1` for that brand and year
  - insert the invoice and all `invoice_items` in the same transaction
- [ ] `update_invoice(payload jsonb) returns public.invoices` — replaces items wholesale in-transaction, never touches `invoice_number`, `number_year`, `number_seq`
- [ ] Revoke `execute` from `public` and `anon`; grant to `authenticated` only
- [ ] **Concurrency test:** fire N concurrent `create_invoice` calls for one brand from one org; assert N distinct sequential numbers and zero gaps
- [ ] **Isolation test:** a caller cannot create an invoice against another org's `brand_id` — the composite FK from `20260811183756_same_org_invoice_refs.sql` is the backstop; prove it fires
- [ ] **Atomicity test:** an `update_invoice` that fails partway leaves the original items intact, not a half-written set
- [ ] **Backstop test:** a forced duplicate `(org_id, brand_id, number_year, number_seq)` raises `23505`

**Verification:** `npm run test:integration` passes; advisors clean.

**Trap:** `for update` on the brand row is what serialises allocation, so the lock must be taken *before* the `max()` read. Taking it after leaves the race the RPC exists to close, and the test above will still pass intermittently — run the concurrency test enough times to be convinced.

**Trap:** `security invoker` means the RPC sees only rows RLS exposes. That is correct and intended. It also means the brand lookup returns "not found" for a foreign brand rather than a permission error — the error message must not imply the brand exists.

---

## Task 5: Invoices through the seam, numbering demoted to provisional

- [ ] `rowToInvoice`/`invoiceToRow` mappers, including `invoice_items` ↔ `Invoice.items` ordered by `position`, and the two jsonb snapshot columns
- [ ] `getInvoices`/`getInvoice` read with `select('*, invoice_items(*)')` and sort items by `position`
- [ ] `saveInvoice` dispatches: no `id` → `create_invoice`, existing → `update_invoice`
- [ ] Retry once on `23505` from `create_invoice`, per spec §9
- [ ] `src/lib/numbering.ts` and its tests survive **unchanged**, demoted to producing the provisional number shown while drafting
- [ ] `invoice-form.tsx` displays the server's returned number after save rather than assuming its own
- [ ] Surface the behaviour change in the UI — the drafting number is provisional and may not be the one assigned (spec §17 risk 5 asks for an explicit note)
- [ ] Port `invoice-form.test.tsx` and the invoice detail tests onto the Task 3 test substitute

**Verification:** full unit + integration suites pass; creating two invoices in two tabs yields two distinct numbers.

---

## Task 6: `use-invoices` on TanStack Query, and the listener machinery goes

The other three hooks moved in Task 3 — see its amendment note.

- [ ] Rewrite `use-invoices` as `useQuery` + `useMutation`, with `save` routing through Task 4's RPCs
- [ ] Keep the hook's return shape — `{ invoices, loading, save, remove, refresh }` — so no consumer changes beyond honouring `loading`. `loading` stops being the hardcoded `false` it is today
- [ ] Optimistic updates on every mutation across all four hooks, each with an `onError` rollback and an `onSettled` invalidate
- [ ] Test the rollback explicitly per hook: a failing save restores the prior cache value
- [ ] `use-plan` is untouched — see Decisions §2
- [ ] Delete `subscribe`, `notify`, the listener set, and the cross-tab `storage` event handler from `storage.ts`

**Verification:** all suites pass; editing a brand updates the sidebar switcher without a refetch round-trip.

**Trap:** the old `useSyncExternalStore` gave every component the same array identity. TanStack Query does not, so a component memoising on identity will re-render more than it used to. Check `brand-switcher.tsx` and `invoice-data-table.tsx` specifically.

---

## Task 7: The loading-state pass

This is where the phase's time actually goes. One skeleton per screen, matching the real layout closely enough that the swap is not a jolt.

- [ ] `/dashboard` — stat cards, chart, invoice table
- [ ] `/brands` and `/brands/[id]/edit`
- [ ] `/clients` and `/clients/[id]/edit`
- [ ] `/invoices/[id]` and `/invoices/[id]/edit`
- [ ] `/reports`
- [ ] `/followups` and `/followups/templates/[id]`
- [ ] Empty state vs loading state must be distinguishable — "No invoices yet" flashing before data arrives is the specific bug this task exists to prevent. Test it: assert the empty copy is absent while `loading` is true

**Verification:** every route renders a skeleton on cold load, never an empty state.

---

## Task 8: Backup export/import through the async seam

`import-export.tsx` writes the four `localStorage` keys directly and calls `forceMigration`. Both mechanisms are gone after Task 10, so the feature breaks unless it is ported.

- [ ] Export reads through the async seam and produces the same file format as today — verify against a file exported by the current build, so restores from before this phase still work
- [ ] Import validates with the existing `import-validation.ts`, normalises with `migrate.ts`, then writes through the seam
- [ ] Import is all-or-nothing, or reports precisely what landed. A half-restored backup that claims success is the worst outcome here
- [ ] Port `import-export.test.tsx`

**Verification:** round-trip a backup file exported by the pre-Phase-2 build; contents match.

**Note:** this is the tested-restore requirement from the pre-launch legal gate. Worth doing properly here rather than revisiting under launch pressure.

---

## Task 9: Close the carry-over test gaps

From `docs/PHASE2-CARRYOVER.md`.

- [ ] Extend `src/test/integration/anon-grants.test.ts` to cover the `authenticated` role, not just `anon` — a `TRUNCATE` regression affecting `authenticated` alone currently passes the suite
- [ ] Add the grants-mirror-policies assertion: join `information_schema.role_table_grants` against `pg_policies` and fail when a role holds a privilege with no matching policy. This catches the gap above automatically and keeps catching it as tables are added
- [ ] Tighten `tenancy.test.ts`'s cascade test to check `deleteUser`'s error and assert the membership existed pre-deletion

**Verification:** `npm run test:integration` passes; the new assertion fails if a grant is deliberately added without a policy (prove it, then revert).

---

## Task 10: Delete the `localStorage` machinery

Last, so every prior task can be verified against a working app.

- [ ] Delete `src/lib/local-storage.ts` and its quota-toast path
- [ ] Delete the remaining snapshot cache, `getSnapshot`, `invalidate`, and the `runMigration`/`forceMigration` cache wrappers from `storage.ts`
- [ ] `src/lib/migrate.ts` **stays** — the importer phase reuses it. Add a comment saying why, or someone will delete it as dead code
- [ ] `savePlan`/`getPlanSnapshot` **stay** on `localStorage` — see Decisions §2
- [ ] Grep for `localStorage` across `src/` and confirm every remaining hit is plan state, theme, or `migrate.ts`
- [ ] Update `README.md` — it currently promises a local-first browser app, which is no longer true (spec §17 risk 3)

**Verification:** full unit + integration suites pass; clean build; zero lint.

---

## Done when

- No app data is read from or written to `localStorage` except plan state and theme.
- Two browser tabs creating invoices against one brand produce two distinct, sequential numbers.
- Every list and detail screen shows a skeleton on cold load and never flashes an empty state.
- A backup exported by the pre-Phase-2 build restores correctly into the hosted app.
- Unit and integration suites both pass, build is clean, lint is zero.
- `docs/PHASE2-CARRYOVER.md`'s test-gap and architecture items are closed, and a fresh carry-over doc records what this phase defers.

## Found during execution — carry into the next phase

- **Nothing seeds the three default email templates any more.** `migrateToV2` wrote them into `localStorage` whenever the templates collection came back empty; templates now live in Postgres, which that migration never touches, so a new account starts with none. Not user-visible while `FEATURES.followups` is off, and not worth a migration until the follow-ups feature is real — but it must be decided before that flag flips, and the natural home is the signup trigger rather than a client-side backfill. Recorded at `import-export.test.tsx`, whose assertion changed because of it.

## Explicitly NOT in this plan

- **Brand logos to Supabase Storage** (spec §8) — the `logo_data` bridge column carries them meanwhile.
- **The `localStorage` importer prompt** (spec §11) — this phase makes the seam async; the importer is its own phase. Task 8 ports the *existing* backup feature, which is a different thing.
- **Landing page, SEO, PostHog, Sentry** (spec §12, §13) — later phase. The proxy's `getClaims()` catch stays a `console.warn` until Sentry exists.
- **Billing** — `usePlan` remains a mock behind its feature flag.
- **The `POST-MERGE-NOTES.md` residuals** — dead `Brand.nextInvoiceNumber` (the mapper drops it; the field's removal from the type is separate), no confirmation on client delete, two stray `alert()` calls, dangling default `templateId`.

## Process note, carried forward

From Phase 1's retrospective: the plan was amended five times mid-execution and each amendment patched its task but not the global sections, so three stale requirements survived to the final review. **If this plan gets amended during execution, re-read Global Constraints and "Done when" before the final gate.**
