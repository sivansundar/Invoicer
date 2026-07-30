# Per-brand invoice template chooser — report

## Structure: two genuinely separate render paths

New directory `src/components/invoices/designs/`:

- `props.ts` — shared prop types (`InvoicePreviewProps`, `InvoicePDFProps`), so both designs
  of each kind take an identical, narrow interface.
- `modern-invoice-preview.tsx` / `modern-invoice-pdf.tsx` — the current design, moved verbatim
  (renamed `ModernInvoicePreview` / `ModernInvoicePDF`), unchanged in appearance.
- `classic-invoice-preview.tsx` / `classic-invoice-pdf.tsx` — the design from `main`
  (`invoice-view.tsx` / old `invoice-pdf.tsx`), ported by taking the actual committed files
  (`git show main:...`) rather than reconstructing from memory, then adapted to:
  - take `snapshot`/`client`/primitives instead of a live `Brand`/`Invoice` (preview) or
    `invoice.brandSnapshot` explicitly (PDF),
  - use `formatStoredDate` instead of `format(new Date(...))`,
  - share `computeTotals`, `taxLabel`, `paymentDetailFields`, `chunkPaymentFieldRows` from
    `@/lib/invoice-preview` instead of the ad hoc totals/bank-table code `main` had,
  - render brand PAN (the screen version on `main` was missing it) and gate the whole
    payment-details block on "at least one field populated" (the original always rendered a
    two-column bank table unconditionally),
  - add a "Paid" indicator to the classic PDF, which `main`'s PDF never had at all (its
    screen version did, via `StatusBadge`) — otherwise a paid invoice's PDF would give no
    visual signal of that under Classic while Modern's does; caught by the paid-invoice
    browser scenario.
- `pdf-fonts.ts` — `Font.register` calls for JetBrains Mono / Noto Sans, imported once for its
  side effect by both PDF designs, so the two never have a chance to drift on font source.

`src/components/invoices/invoice-preview.tsx` and `invoice-pdf.tsx` are now thin dispatchers:
they read `resolveInvoiceDesign(snapshot.invoiceDesign)` and render `Modern*`/`Classic*`. No
conditionals inside either design's JSX — adding a third design later means adding a third
`designs/*` pair and one more branch in the two dispatchers, not touching either existing design.

## Shared vs. duplicated

Shared (unchanged, single source of truth): `computeTotals`, `taxLabel`, `paymentDetailFields`,
`chunkPaymentFieldRows` from `src/lib/invoice-preview.ts` — both designs, both preview and PDF,
call these rather than re-deriving totals or re-filtering bank fields. Also shared: PDF font
registration (`pdf-fonts.ts`) and the design-resolution helper (`src/lib/invoice-design.ts`).

Deliberately duplicated: each design's own layout, `StyleSheet`, colour palette and typography —
Modern and Classic are visually unrelated languages (rounded card/soft palette vs. ruled table/
mono type), so unifying their styling would be coupling two designs that are supposed to be
independently editable. The one currency-formatting helper (`Amount` in modern PDF /
`amountRun` in classic PDF) is duplicated in the same spirit — react-pdf styles aren't portable
across two totally different `StyleSheet`s, and both are ~6 lines wrapping `formatCurrencyAmount`.

## Naming

`InvoiceDesign` (`"modern" | "classic"`), `Brand.invoiceDesign`, `BrandSnapshot.invoiceDesign`,
`src/lib/invoice-design.ts`, `resolveInvoiceDesign`, `DEFAULT_INVOICE_DESIGN`,
`INVOICE_DESIGN_OPTIONS`. Never "template" — that word is already `EmailTemplate`/
`useTemplates()`/`src/lib/templates.ts` for the unrelated follow-up-email feature. File names in
`designs/` say `-preview`/`-pdf` explicitly (`modern-invoice-preview.tsx`, not
`modern-template.tsx`) for the same reason.

## Field shape: optional, not required

`Brand.invoiceDesign` and `BrandSnapshot.invoiceDesign` are typed `InvoiceDesign | undefined`
(optional), not a mandatory field defaulted only at construction time. Every *read* goes through
`resolveInvoiceDesign`, which treats `undefined` identically to `"modern"` — so the default is
decided in exactly one place, not re-implemented at every call site.

This was a deliberate scope decision: a required field would have forced type-level changes to
every file that constructs a `Brand`/`BrandSnapshot` object literal, including several test
fixtures well outside this task's file ownership (`page.test.tsx`, `client-form.test.tsx`,
`invoice-form.test.tsx`, `invoice-data-table.test.tsx`, `import-export.test.tsx`,
`storage.test.ts`) that another agent was concurrently touching. The optional-plus-resolver
pattern gets the same runtime guarantee (every *write* path — `brand-form.tsx`, `snapshotFromBrand`,
migration — always sets a concrete value) without widening the blast radius. `invoice-form.tsx`
and `pdf-download-button.tsx` needed **no changes at all** as a result: `EMPTY_SNAPSHOT` (no
brand chosen yet) simply omits the field and resolves to modern.

## Migration and backfill

`src/lib/migrate.ts`:

- `snapshotFromBrand` now sets `invoiceDesign: resolveInvoiceDesign(brand.invoiceDesign)` — the
  one function the invoice form and migration both call to freeze a brand, so a field added
  here can't end up on one call site and not the other (the same property the existing doc
  comment on this function already calls out for every other field).
- `fallbackSnapshot` (used when an invoice's brand no longer exists) sets
  `invoiceDesign: DEFAULT_INVOICE_DESIGN` explicitly.
- `migrateToV2`'s brand mapping backfills `invoiceDesign: resolveInvoiceDesign(brand.invoiceDesign)`
  for every brand, same `??`-style non-destructive pattern as the existing `accentColor`/
  `followup` backfills.
- `migrateToV2`'s invoice mapping: when `invoice.brandSnapshot` already exists (the common case
  — most invoices predate this field), it's spread and only `invoiceDesign` is backfilled
  (`resolveInvoiceDesign(invoice.brandSnapshot.invoiceDesign)`) — every other frozen field is
  left untouched, byte-for-byte. When no snapshot exists at all, a fresh one is synthesised via
  `snapshotFromBrand`/`fallbackSnapshot`, both of which already carry the correct design. An
  existing snapshot that already has an explicit design (e.g. `"classic"`) is never rewritten —
  `resolveInvoiceDesign` passes a defined value straight through.

New/updated tests in `migrate.test.ts`: brand backfill to modern, brand design left alone when
already set, snapshot backfill on both a synthesised and a legacy-shaped-but-present snapshot,
and an explicit "never rewrites an existing snapshot's invoiceDesign" test. A new
`snapshotFromBrand — invoiceDesign` block covers the default, an explicit classic value, and the
freeze invariant directly (`snapshotFromBrand` called before and after mutating the brand's
design, asserting the earlier snapshot is unaffected).

`src/lib/invoice-design.ts` + `invoice-design.test.ts`: `resolveInvoiceDesign` for undefined/
modern/classic, and a sanity check on `INVOICE_DESIGN_OPTIONS`' order/content.

## The chooser UI

`brand-form.tsx`, placed directly below "Accent colour" and above "Address" — same idiom as the
follow-ups tone picker (`ToggleGroup`/`ToggleGroupItem`, `type="single"`), not a new pattern.
Each item carries a two-line label (bold name + one-line description) rather than a bare word,
using `spacing={1}` on the `ToggleGroup` so the connected-segmented-control styling built into
`toggle-group.tsx` (rounded-none, shared borders) doesn't apply to what are meant to read as two
separate option cards.

## Verification

```
npm test        → 34 files, 429 tests passed (0 failed)
npx tsc --noEmit → 0 errors
npm run lint     → 0 problems
npm run build    → succeeded, all 14 routes generated
```
(404 tests were the stated baseline; 25 new tests were added across
`invoice-design.test.ts`, `migrate.test.ts`, `invoice-preview.test.tsx`, and the new
`classic-invoice-preview.test.tsx`.)

One incidental fix required for lint: `eslint.config.mjs` had a file-scoped
`@next/next/no-img-element` override for exactly `invoice-preview.tsx` (a user-uploaded logo
data-URI has no origin for `next/image` to optimize). Since that `<img>` moved into
`designs/modern-invoice-preview.tsx` and `designs/classic-invoice-preview.tsx`, the override
list was updated to point at the two new files instead — otherwise lint would show 2 warnings
that didn't exist on the original single-file version.

## Browser verification (Playwright, `npm install --no-save playwright`, cached Chromium)

Four brands were created via the real UI (not seeded), one per corner of the coverage matrix:
Aurora Design Co (Modern, odd/3 bank fields, no logo), Northlight Studio (Modern, no bank
details, no logo), Vintage Traders (Classic, no bank details, no logo, toggled via the UI
chooser), Chrono Studio (Classic, odd/3 bank fields, no logo, toggled via the UI chooser). Four
invoices were created against them, two later marked paid via "Mark as paid".

1. **Classic switch → preview changes → PDF matches.** Chrono Studio invoice CS-2026-001,
   downloaded and rendered with `pdftoppm`: ruled `DESCRIPTION/AMOUNT/TAX/TOTAL` table, uppercase
   tracked labels, JetBrains Mono body — matches the on-screen classic preview exactly.
2. **Modern switch → preview changes → PDF matches.** Aurora Design Co invoice ADC-2026-001,
   downloaded and rendered: rounded card, Noto Sans body, "Payment details" lowercase — matches
   the on-screen modern preview.
3. **Frozen-snapshot invariant.** Created CS-2026-001 while Chrono Studio was Classic; edited
   Chrono Studio to Modern and saved (`localStorage` check: `{"brandDesign":"modern",
   "snapshotDesign":"classic"}`); revisited the invoice — preview and downloaded PDF were
   **still Classic**. The `pdftoppm`-rendered PNGs from before and after the brand switch are
   **byte-identical** (`md5` match), i.e. not just visually similar but pixel-for-pixel the same
   document.
4. **Live editor switch.** On `/invoices/create`, selecting Aurora Design Co (Modern) then
   reselecting Vintage Traders (Classic) — with nothing saved — instantly swapped the live
   preview pane from the rounded-card design to the ruled-table design.
5. **Edge-case coverage, both designs.** No logo (all four brands, initials-square fallback
   rendered correctly in both designs' screen and PDF): confirmed. Odd (3) bank fields with the
   trailing field spanning full width (Aurora/Modern: Account name+Bank+Branch; Chrono/Classic:
   Account name+IFSC+UPI ID): confirmed on screen and in the rendered PDF. No bank details at
   all (Northlight/Modern, Vintage/Classic): payment-details block correctly absent in both
   screen and PDF. Paid invoice (Northlight/Modern, Vintage/Classic): "Paid" pill/badge rendered
   in both screen previews; in PDF, Modern already had a "Paid" pill — Classic's PDF was missing
   one entirely until this pass added it (see "Structure" above), now confirmed present in the
   rendered PDF for both.

Playwright uninstalled afterward (`npm uninstall playwright`); `git diff package.json` is empty.

## Concerns

- `Brand.invoiceDesign`/`BrandSnapshot.invoiceDesign` being optional (not required) is the one
  place I diverged from the letter of "Add the field... defaulting to modern" toward "optional
  field, defaulted by a single resolver function" — documented above under "Field shape". I
  believe this is the right call given the concurrent-agent file-ownership constraints, but it's
  worth a second look if a future change wants the type system itself to guarantee the field is
  always set.
- The classic PDF's payment-details table now uses the same row-paired flexbox grid as the
  modern PDF (via the shared `chunkPaymentFieldRows`) rather than `main`'s original two static
  columns (Account name/Bank/Branch fixed-left, Account number/IFSC/UPI fixed-right) — a
  deliberate adaptation to satisfy "only populated fields, lone trailing field spans full width"
  without duplicating that logic, but it is a genuine (minor) layout change from what shipped on
  `main`, not a byte-for-byte port of that one block.
- Mid-session, `src/lib/types.ts` and `src/lib/migrate.ts` were each found reverted to their
  pre-edit state at least once, with no action taken on my end to cause it — almost certainly a
  side effect of the other concurrently-running agent's own git operations on the same working
  tree. I re-applied and re-verified both files (via direct `cat`, not just tool output) before
  continuing, and confirmed the final state via a clean `git diff` review below, but flagging
  it in case something similar affected files I didn't think to re-check.
