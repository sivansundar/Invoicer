# Phase 3 carry-over — read before starting Phase 4

Written at the end of the SaaS Phase 3 branch (`feat/saas-phase3-logos-import`,
a green unit + integration suite, plus a final whole-branch review pass before merge).
Everything here was found during execution, consciously deferred, or decided in a way the next
phase needs to know about.

Phase 3 moved brand logos out of `brands.logo_data` (a base64 bridge column, itself a Phase 2
stopgap) into a private, content-addressed Storage bucket, and built the one-time prompt that
imports data left behind by the app's earlier local-only build. See
`docs/superpowers/plans/2026-08-13-saas-phase3-logos-import.md` for the plan, its decisions, and
the full "Found during execution" log this document draws on.

Two items from `docs/PHASE3-CARRYOVER.md`'s "Do this first" section are now closed and do not
repeat here: logos migrating off the bridge column into Storage, and the local-data import
prompt existing at all. Everything else in that document is still open and is repeated below
rather than left behind in a file about a finished phase.

---

## Process note, read first

Phase 1's lesson was that a plan amended mid-execution grows stale global sections. Phase 2's
was *falsify a test before trusting it.* Phase 3's is sharper:

Six tests in this project have now passed for the wrong reason, produced by three distinct
mechanisms — a `waitFor` whose condition holds during loading as well as after failure; a
mutation that breaks two assertions so the run dies on the first and never proves the second
load-bearing one; and an assertion that holds identically in the broken and working states (a
"button is absent" check passes whether the gate is correct or permanently closed).
**Falsifying is not enough on its own: check that the number of tests that failed matches the
number that should have.** A probe reporting three failures where six tests depend on the
behaviour is the tell — that mismatch is how a vacuous test survived a full review round this
phase.

Also worth stating: **"all pre-existing tests pass unmodified" does not prove a refactor was
faithful.** It proves no *tested* behaviour changed. Task 6 of this phase reimplemented conflict
resolution against a re-derived match instead of the one captured when the dialog opened —
turning a user's "discard" into a created record — and every test passed, because the bug needs
a fresh lookup to disagree with a captured one, which cannot happen in a single synchronous tab.
Only a hunk-by-hunk read of the moved code found it.

And: **when a fix makes a dormant path reachable, re-examine the guards around that path, not
just the path.** This phase hit that twice — a Task 2 change to `saveBrand`'s atomicity armed a
bug that had sat harmlessly in the brand-create form for months, and a ruling to make the import
prompt discard rather than overwrite made "local-only, unresolved" a state the "Clear local
copy" gate had never had to account for.

---

## What Phase 3 leaves behind

- **`brands.logo_data` is not dropped.** Brands whose owner has not re-uploaded since Phase 3
  still render from it — `saveBrand` only clears it on a fresh upload. Dropping the column needs
  either a backfill of every remaining base64 logo into Storage, or accepting that those logos
  disappear. Neither has been decided.
- **Storage objects are never deleted**, including on brand delete. Content addressing means an
  old object can still be the one referenced by an invoice's frozen `brand_snapshot` — deleting
  it on brand delete, or on re-upload, would break rendering a PDF for an invoice issued while it
  was current. The bucket grows by one object per distinct image, never shrinks. This has a
  concrete consequence for the launch-gate phase: **DPDP erasure must list an org's brands and
  delete their objects individually**, because the object path is `{brandId}/{sha}.png` — keyed
  by brand id, not prefixed by `org_id` — so there is no single prefix that deletes an org's logos
  in one call.
- **`saveBrand` is not atomic.** It upserts the row, uploads the object, then writes the path back
  — in that order, because the bucket's INSERT policy requires the row to exist first, and a
  brand's id is generated client-side before any row does. A failure after the first write leaves
  the row committed, including any unrelated fields (address, phone, bank details, ...) edited in
  the same save, while the promise the caller awaited rejects. A caller that reads "the promise
  rejected" as "nothing changed" is wrong about everything except the logo. The base64 left in
  `logo_data` by that first write is a deliberate fallback, not an oversight — it is what the
  brand renders from until the next successful save re-attempts the upload.
- **Invoice-number conflict detection is global, not per-brand.** `writeInvoices` builds its match
  map from `getInvoices()` with no brand filter, but numbering is per-brand, so two brands both
  starting at `INV-001` collide spuriously. Pre-existing before this phase and moved verbatim by
  Task 6's extraction; left unchanged deliberately, not missed. It is bounded in the import prompt
  by the discard-only resolver below, and user-visible (and already accepted) in the file
  importer's own conflict dialog.
- **The import prompt discards collisions rather than overwriting them.** The prompt persists
  until dismissed, so it can run weeks after signup against an account that already has real
  invoices — passing `overwrite` would let an old browser tab silently clobber one of them.
  `discard` can't destroy anything, because this flow never deletes the local copy on its own.
  The corollary: **"Clear local copy" is withheld whenever anything was discarded or failed**,
  because a discarded or failed invoice now exists in exactly one place — this device — and
  offering the button anyway would let one click delete the only copy of something that never
  made it across. Don't simplify either half of this back; they were both made deliberately and
  the second was found only after the first was live.
- **`prepareImport`'s validation-time skips were not surfaced in the prompt's summary, and this
  was a real data-safety bug, not a cosmetic one — corrected in the final pre-merge review.**
  `LocalImportPrompt`'s "Clear local copy" gate (`importedEverything`) was built only from
  `writeImport`'s result, which has no visibility into anything `prepareImport` had already
  dropped (`skipped`/`invalidShape`) or that `readLocalCollections` couldn't even parse (a
  corrupt `invoicer_*` key). A local invoice with, say, a malformed line item was silently
  skipped during validation, the summary reported a smaller "imported" count than "we found N
  invoices" had promised, and the button was still offered — one click deleted the only copy of
  the very record that had just been rejected. Fixed by threading `prepareImport`'s
  `skipped`/`invalidShape` and `readLocalCollections`'s new `corruptKeys` into both the gate and
  the summary. **The rule this leaves for Phase 4:** any gate that decides whether it's safe to
  delete a local/source copy must account for everything dropped *before* the write step, not
  only what the write step itself reports — a write function has no way to know what it was
  never handed.
- **No test covers a signed URL actually expiring.** `LOGO_URL_TTL_SECONDS` and the shorter
  `staleTime` in `useLogoSrc` that is supposed to refetch before it lapses are reasoned about, not
  proven against a real expiry.
- **`Brand.nextInvoiceNumber` is still dead.** Untouched again this phase; still on the type and
  in every fixture, still unread by anything.
- **Deferred minors:**
  - `BrandLogo`'s `<img>` has no `loading="lazy"` or width/height attributes. Matches the previous
    inline implementation it replaced — not a regression, just never fixed.
  - The new storage policy names (`"brand logos are readable by their brand's org"`, and its
    writable/replaceable siblings) are full sentences with spaces, where this repo's convention
    elsewhere is short snake_case (`brands_select`). It originated in the plan's own SQL and
    nobody renamed it on review.
- **Neither import entry point invalidated the query cache — fixed in the final pre-merge
  review.** Both `LocalImportPrompt` and `ImportExport` write through `writeImport`/`writeCollection`
  directly, bypassing the `useBrands`/`useInvoices`/`useClients`/`useTemplates` mutation layer
  that owns `onSettled` invalidation (`src/hooks/optimistic.ts`). With `refetchOnWindowFocus:
  false` and a 60-second `staleTime`, a screen that had already rendered from an empty or stale
  cache before the import ran kept showing that stale data for up to a minute afterward — a user
  could accept the local-data prompt, see "Invoices imported 14," click Done, and land on a
  dashboard still reporting zero invoices. Both call sites now call `queryClient.invalidateQueries()`
  once the import completes.

---

## Decisions Phase 2 made that Phase 4 should not silently reverse

Phase 3 didn't touch most of this ground, which is an argument for carrying it forward, not
dropping it — these constrain phases that haven't happened yet, and two of the five were
materially exercised this phase.

- **`org_id` never appears in application code.** It's filled by a column default
  (`private.current_org_id()`), and RLS is the only read filter. Passing it explicitly is a bug
  even when it produces the right answer. This is the exact reasoning recorded in
  `supabase/migrations/20260813084629_brand_logos_bucket.sql`'s own comments for why the logo
  object path is keyed by `brand_id` rather than `org_id` — and it's what this phase's
  DPDP-erasure carry-over item (above) depends on staying true: there is no `org_id` to filter or
  prefix by, by design, so erasure has to go through each brand instead.
- **The seam throws; it does not return `false`.** `tsc` can't catch a regression here —
  `if (!save(x))` on a promise is never true — so a caller that branches on a boolean fails
  silently. Convert callers by hand, not by trusting the typechecker.
- **`createInvoice` is separate from `saveInvoice`.** Dispatching internally would need a round
  trip to learn whether the row exists, and guessing wrong either renumbers a sent invoice or
  fails an edit. The import pipeline's `createInvoice`/`saveInvoice` calls depend on this staying
  two functions.
- **Creating an invoice is not optimistic**, unlike every other mutation: the server allocates the
  number, so an optimistic insert shows a number the invoice doesn't have.
- **Unit tests drive an in-memory fake of the seam** (`src/test/fake-seam.ts`), not MSW.
  `fake-seam.test.ts` asserts the fake exports exactly what the real module does — keep it
  passing when the seam changes, or every test that mocks storage starts calling `undefined`.
  This phase found the fake actively lying: `src/lib/storage.ts` upserts a brand's row before
  uploading its logo, so a failed upload leaves the row committed; `src/test/fake-seam.ts` did
  the reverse; a throwing upload never reached `upsert`, so the row was absent. Two test comments
  described a committed-row mechanism their tests couldn't reach. Fixed to mirror the real
  three-step ordering exactly — but it's a reminder that a fake whose failure ordering diverges
  from the real seam's is a false-confidence generator, and the import pipeline (Tasks 6 and 8)
  builds directly on this fake for brand-writing paths. When a seam's failure ordering is
  load-bearing, the fake has to reproduce the ordering, not just the outcome.

---

## Test gaps worth closing

- **No test covers two *browsers* creating invoices at once.** `src/test/integration/rpc.test.ts`
  (see `"issues distinct, gapless numbers under concurrent calls"`) fires concurrent RPCs from
  one client, which exercises the lock, but the end-to-end path — two tabs, each with its own
  provisional number, both saving — is only reasoned about.
- **`/reports` and `/invoices/[id]` have skeletons but no loading-state test.**
  `src/app/(app)/loading-states.test.tsx` covers `/clients`, `/brands`, and the brand/client/
  invoice **edit** screens; `/reports` has no test file at all, and `/invoices/[id]`'s
  `page.test.tsx` covers save-failure guards, not its loading state. Both are still wired by hand
  and checked only by eye.

---

## Operational

- **`supabase/config.toml` is production-unsafe as committed.** `enable_signup = true` with
  `enable_confirmations = false` is correct locally — it's what lets integration tests use
  `signInWithPassword` — but the CLI pushes this file verbatim. On a hosted project it would let
  anyone self-register an arbitrary email, pre-confirmed, while the product's stated auth surface
  is magic link + Google only. **The deploy checklist must gate it.** Carried since Phase 1, still
  true, still ungated.
- **Wire the proxy's `getClaims()` catch to Sentry** when a later phase adds it
  (`src/lib/supabase/proxy.ts`). It `console.warn`s and fails closed, so a JWKS outage logs every
  user out with only a console line as signal. Carried since Phase 2; Sentry itself is still out
  of scope (spec §12, landing-page phase).
- **`pg_default_acl` retains a second entry owned by `supabase_admin`**, granting
  `TRUNCATE/REFERENCES/TRIGGER` to `anon`/`authenticated` on any table that role creates in
  `public`. The revoke covers the `postgres` grantor, which is the one migrations run as, so it's
  not reachable through the normal path — worth knowing before assuming the revoke is global.
- **Deleting a user orphans their org rather than cascading.** `org_members.user_id` cascades from
  `auth.users`; `orgs` does not cascade from `org_members`. Pinned by a test in `tenancy.test.ts`
  so it stays a decision, not a bug. The DPDP erasure path has to remove the org deliberately —
  and, per this phase's addition above, its brands' Storage objects too.

---

## Known limitations, stated so they are not discovered

- **Re-importing the same pre-Postgres data duplicates records whose ids were rewritten.** True of
  both the file importer and the new prompt: rewritten ids have nothing to match against on a
  second pass, so a second import adds a second copy rather than skipping. Deterministic
  remapping would fix it but can't be used — `email_templates.id` is a global primary key, so
  hashing a legacy id to a fixed uuid makes two different accounts importing the same backup
  collide. The import summary tells the user when this applies; the README now describes the
  prompt as the primary path and keeps this caveat.
- **Import is not all-or-nothing.** Conflict resolution is interactive across dialog round-trips
  (file importer) or resolved automatically to `discard` (the prompt), so no transaction spans
  either. Per-record accounting is accurate instead. A single `import_backup` RPC could make the
  no-conflict path atomic, but a restore that's atomic only when it happens not to collide is a
  worse contract than one that's never atomic and always accurate.
- **Nothing enforces a per-account data cap.** Every write is an authenticated insert with no size
  or row limit — implicitly bounded by the `localStorage` quota before Phase 2, unbounded since.

---

## Polish

- `src/lib/supabase/{client,server,proxy}.ts` use `process.env.X!` with no runtime guard, unlike
  `src/test/integration/helpers.ts` which validates and throws a useful message. A missing
  `.env.local` fails deep inside the Supabase SDK instead of at a clear boundary.
- `src/app/(auth)/login/page.tsx` surfaces raw Supabase error strings via `toast(error.message)`.
  The app's own copy is hand-written, dry and second-person; provider text reads as foreign.
  Wants a copy pass alongside the real landing page.
- The Google sign-in button has no pending/disabled state, unlike the email form.
- `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts` lists `/pricing`, `/privacy` and `/terms`, which
  still don't exist as routes. Deliberate — the landing-page and legal-gate plans add them.
- `docs/POST-MERGE-NOTES.md` residuals still open: no confirmation on client delete, and one
  remaining stray `alert()` in `summary-report-dialog.tsx` (its sibling in
  `pdf-download-button.tsx` was replaced with a toast this phase).
