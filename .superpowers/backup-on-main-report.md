# Full backup export/import — report

## What was built

- `src/lib/import-validation.ts` — shape detection and per-record validation, pure
  functions, no React/DOM. Two entry points:
  - `validateImportedInvoices(parsed)` — the legacy path. Rejects outright
    (`{ ok: false }`) if `parsed` isn't an array; otherwise validates each element
    and returns `{ ok: true, valid, skipped }`.
  - `validateImportedBackup(parsed)` — the full-backup path. Rejects outright if
    `parsed` isn't a plain object; otherwise validates `brands`, `clients`, and
    `invoices` independently via `validateCollection`, each returning
    `{ valid, skipped, invalidShape }`. A collection key that's simply absent from
    the envelope is treated as empty, not an error — this is what makes an extra
    `templates` key from the sibling `feat/shadcn-rewrite` envelope harmless (it's
    silently ignored) and what makes a backup produced *here* import cleanly on
    that branch (its importer already treats absent keys as empty, per the task
    brief).
  - Per-record validators (`isValidInvoiceRecord`, `isValidBrandRecord`,
    `isValidClientRecord`, `isValidBankDetails`, `isValidLineItem`) check exactly
    the fields the app's rendering code dereferences without a guard (verified
    against `brand-card.tsx`, `client-card.tsx`, the invoice preview/PDF, and
    `invoice-table.tsx`) — not a full schema match, so unknown/extra fields pass
    through untouched.
  - Unit tested in `src/lib/import-validation.test.ts` (15 new tests): a
    non-array/non-object payload; a bare legacy array with junk elements mixed
    in; a valid envelope; a collection whose value isn't an array
    (`invalidShape`); an absent collection treated as empty; an ignored extra
    `templates` key; and a mixed payload where some records validate and some
    don't, across all three collections.

- `src/components/invoices/import-export.tsx` — rewritten `handleExport` and
  `handleFileChange`/import pipeline, closely mirroring the equivalent
  implementation already on `feat/shadcn-rewrite` (same envelope, same
  conflict/report shape) but trimmed to this codebase's simpler data model (no
  `templates`, no `EmailTone`, no migration/`forceMigration` step — none of that
  exists here). Kept the existing `ImportSummary`/summary-dialog idiom rather
  than introducing a new results UI; added a `CollectionSummaryRows` helper so
  brands/clients get the same per-collection reporting pattern without
  duplicating the dialog markup three times.

- `src/lib/storage.ts` — `setItem` now wraps `localStorage.setItem` in a
  try/catch and returns `boolean` (success/failure) instead of `void`.
  `saveBrand`, `saveClient`, `saveInvoice`, and `deleteInvoice` propagate that
  boolean. Every other caller of these functions in the app ignores the return
  value, so this is a non-breaking, additive change — nothing else changed in
  the storage layer.

## Envelope shape

```json
{
  "version": 2,
  "exportedAt": "<ISO timestamp>",
  "brands": [ /* Brand[] */ ],
  "clients": [ /* Client[] */ ],
  "invoices": [ /* Invoice[] */ ]
}
```

Same `version: 2` and key names as `feat/shadcn-rewrite`'s envelope, just
omitting `templates` (this codebase has no email templates). Download filename
changed from `invoices-<date>.json` to `invoicer-backup-<date>.json`.

## Legacy-file detection

`handleFileChange` parses the uploaded JSON, then branches purely on shape:
`Array.isArray(parsed)` → routed to `validateImportedInvoices` (the untouched
legacy path, byte-for-byte the same validation every `invoices-<date>.json`
file already on disk goes through); anything else (a JSON object) → routed to
`validateImportedBackup`. A payload that's neither (a string, a number, `null`)
is rejected by whichever validator it lands in without writing anything.

## Conflict semantics

- **Brands and clients**: skip-on-`id`-conflict, never overwritten — checked
  against both what's already in storage *and* what's already been imported
  earlier in the same file (so a backup with a duplicated `id` internally
  doesn't double-import). Reported as `<label> skipped (already exist)`,
  distinct from `<label> skipped (invalid)` (failed validation) and
  `<label> section unreadable` (the whole collection's value wasn't an array).
  Restoring into an empty app therefore imports everything; merging a backup
  into a populated app can't clobber a local edit — confirmed by scenario 4
  below.
- **Invoices**: unchanged from the app's existing behavior — a conflict on
  `invoiceNumber` opens the existing per-invoice dialog (overwrite / rename /
  discard), before this work and after.
- **Brands/clients are imported before invoices**, so an imported invoice's
  `brandId` resolves against a brand that already exists in storage by the
  time anything reads it.

## Quota guard

`setItem` now catches a `localStorage.setItem` failure (most commonly
`QuotaExceededError`, but any thrown error is caught) and returns `false`
instead of letting it propagate. The importer checks that boolean on every
write (`saveBrand`, `saveClient`, `saveInvoice`, and `deleteInvoice` during an
overwrite) and counts a failed write as `failed`, not `imported` — the summary
dialog shows a "Failed to save" row per collection, and `finishImport` raises
an `alert()` naming which collections had failures so the report is honest
rather than silently claiming success. Kept intentionally small: no retry
logic, no quota-size probing, no refactor of the rest of the storage layer.

## Verification

```
npm test                                   → 4 test files, 33 tests passed
                                              (18 pre-existing + 15 new in
                                              import-validation.test.ts)
npx tsc --noEmit 2>&1 | grep -c "error TS" → 0
npm run lint 2>&1 | tail -1                → 12 problems (8 errors, 4 warnings)
npm run build                              → succeeded
```

Note on the tsc count: the task's baseline measurement (8 errors) was taken
before any `next build` had run in this environment. `tsconfig.json` includes
`.next/types/**/*.ts`, which `next build` generates; without it, `tsc` reports
errors against routes/types that don't exist yet. Once I ran `npm run build`
(required for the final verification step anyway), the same 8 errors
disappeared identically on both the pristine baseline (verified via
`git stash`) and this branch's changes — confirming this is a build-artifact
side effect, not something my changes fixed or introduced. Either way the
count did not go up (0 ≤ 8). Lint stayed exactly at the baseline count; the
one lint deviation I hit mid-implementation (`hasAnyCollectionWrite` from an
early draft that ported the rewrite branch's `forceMigration` trigger — dead
code once trimmed, since this codebase has no migration step) was removed
before finishing.

One caught-and-fixed mistake during implementation: my first draft of
`import-export.tsx` included a `hasAnyCollectionWrite` helper left over from
adapting the `feat/shadcn-rewrite` reference implementation (which uses it to
decide whether to call `forceMigration()`, a function that doesn't exist on
this branch). It became dead code and tripped
`@typescript-eslint/no-unused-vars`, bumping lint to 13 problems. Removed it;
lint returned to the 12-problem baseline.

## Browser verification (Playwright, cached Chromium, no network)

All four scenarios exercised against `npm run dev` on `http://localhost:3000`
with a script seeding/reading `localStorage` directly and driving the actual
Import/Export UI on the dashboard:

1. **Seed brands + clients + invoices, export, clear localStorage entirely,
   re-import.** Export downloaded as `invoicer-backup-2026-07-30.json`.
   After clearing storage and reloading, `invoicer_invoices` was empty (`0`).
   Importing the downloaded file showed the summary "Invoices imported: 1,
   Brands imported: 1, Clients imported: 1"; after reload, all three
   collections were restored (1 each) and the invoice row (`SC2026001`)
   rendered on the dashboard. **Confirmed.**

2. **Import an existing-format bare `Invoice[]` file.** Wrote a plain
   `[{...invoice}]` array (no envelope) to disk and imported it into a cleared
   app. Summary showed only "Invoices imported: 1" (no brand/client rows at
   all, confirming the legacy path's summary looks exactly as it did before
   this change), and the invoice (`SC2026099`) landed in storage. **Confirmed
   — behaves exactly as before.**

3. **Import a malformed envelope.** Built an envelope with: one valid brand,
   one brand missing required fields, one non-object element in `brands`; a
   `clients` value that's a string instead of an array; and one invoice
   missing required fields. Result: "Invoices imported: 0, Skipped
   (invalid): 1", "Brands imported: 1, Brands skipped (invalid): 2",
   "Clients imported: 0, Clients section unreadable: skipped" — every
   rejection reported per collection, nothing silently dropped, and no
   `pageerror` was raised (empty error array captured). **Confirmed.**

4. **Import a backup into an app that already has one of the same brands.**
   Seeded the app with a brand named `"LOCAL EDITED NAME - should not be
   overwritten"` under `id: "brand-1"`, then imported a backup containing a
   brand with the same `id` but named `"INCOMING NAME - should be skipped"`.
   Summary showed "Brands imported: 0, Brands skipped (already exist): 1";
   after import, storage still had exactly 1 brand with the original local
   name. **Confirmed — skip-on-conflict, reported distinctly from an invalid
   skip.**

Playwright was installed with `npm install --no-save playwright`, used the
pre-cached Chromium at `~/Library/Caches/ms-playwright`, made no network
calls, and was uninstalled afterward (`npm uninstall --no-save playwright`).
`git diff --stat package.json package-lock.json` is empty — confirmed
unchanged.

## Concerns

- The pre-existing 8 tsc errors and 12 lint problems are untouched, per
  instructions — see the tsc note above for why the *measured* tsc count
  looks like 0 rather than 8 in this report (build-artifact effect, not a
  code fix).
- `deleteBrand`/`deleteClient` were left returning `void` — nothing in this
  feature calls them, and the task asked to keep the storage change minimal
  rather than refactor the whole layer. If a future caller needs an honest
  delete-failure signal, the same `setItem` boolean is already there to
  propagate.
- The quota guard only prevents an uncaught exception and reports failure
  honestly; it does not proactively probe remaining quota or partially free
  space. A backup large enough to hit the quota mid-collection (e.g. brands
  succeed, invoices fail) will report a partial success accurately, which is
  the intended behavior, but the user is left to manually reduce data size
  and retry.
