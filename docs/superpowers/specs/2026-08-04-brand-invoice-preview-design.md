# Brand invoice preview

**Date:** 2026-08-04
**Status:** Approved

## Problem

The brand form's Modern/Classic chooser (`INVOICE_DESIGN_OPTIONS` in
`src/lib/invoice-design.ts`) describes each design in a sentence of prose. Its
own comment admits why: the description is what lets someone "pick correctly
without having to create a test invoice first." That is a workaround for a
missing preview, not a design. Every other brand field — logo, accent colour,
address, GST number, bank details — has the same problem in a quieter form: you
cannot see what any of them look like on the document a client receives until
you have saved the brand and issued an invoice.

## Solution

Render a live invoice preview beside the brand form on both `/brands/create`
and `/brands/[id]/edit`. The brand half of that invoice comes from the form as
you type it; the invoice half (client, line items, dates) comes from the
brand's most recent invoice, or from placeholder data when the brand has none.

Nothing new is rendered. `InvoicePreview`
(`src/components/invoices/invoice-preview.tsx`) is already a pure dispatcher
over `BrandSnapshot` plus invoice primitives, used by the invoice editor and
the invoice detail screen. The brand form becomes its third consumer. No
design component (`ModernInvoicePreview`, `ClassicInvoicePreview`) is touched.

## Components

### `src/lib/brand-preview.ts` (new, pure)

- `latestInvoiceForBrand(invoices, brandId): Invoice | null` — the brand's most
  recently created invoice, or `null` when the brand has none or has no id yet
  (the create page). Sorts on `createdAt` descending.
- `brandPreviewBody(invoice, invoicePrefix): BrandPreviewBody` — the non-brand
  half of the preview: `client`, `invoiceNumber`, `billDate`, `dueDate`,
  `items`, `currency`, `notes`, `isPaid`. Returns the real invoice's values
  when one is passed; otherwise placeholder values, with `invoiceNumber`
  derived from the passed-in prefix so it tracks the prefix field as it is
  typed.

Placeholder body: one client, two line items (one taxed, one not), dates
relative to a fixed reference so tests stay deterministic.

### `src/components/brands/brand-form.tsx` (modified)

- Root goes from `p-6 max-w-[660px]` to the same two-pane flex layout the
  invoice editor uses: form left, `bg-muted border-l` preview pane right at
  `min-w-[508px]`, wrapping underneath below that width.
- The preview pane is `sticky` — the brand form is long, and the shell scrolls
  at `overflow-y-auto`, so sticky anchors correctly.
- The `Brand` record currently built inline in `handleSubmit` is lifted into a
  memoized `draftBrand` used by both `handleSubmit` and the preview, then fed
  through the existing `snapshotFromBrand`. One construction site, so the
  preview cannot drift from what saving actually writes.

## Decisions

**Brand fields are live; the invoice body is not.** Form state starts equal to
the saved brand, so this is indistinguishable from "show the saved brand" until
something is edited. Editing then shows the consequence immediately, which is
the entire point.

**Empty brand fields render empty.** No invented "Your Brand Name" filler. This
matches the invoice editor's `EMPTY_SNAPSHOT` behaviour, and a blank slot on a
new brand reads as "fill this in" where fake text reads as already-done. The
document never looks broken regardless, because the placeholder body supplies
the table, totals and structure.

**Real invoice numbers are not rewritten.** When a real latest invoice backs
the preview, its own `invoiceNumber` is shown. Only the placeholder body
derives its number from the live prefix field.

**The chooser keeps its descriptions.** They are now redundant as a
substitute-for-seeing-it, but remain useful scan text next to the toggle.

## Testing

- `src/lib/brand-preview.test.ts` — latest-invoice selection, ordering, brand
  with no invoices, missing brand id, prefix threading into the placeholder
  number, real invoice values passing through unchanged.
- `src/components/brands/brand-form.test.tsx` — toggling the design swaps the
  rendered design in the preview pane; typing a brand name updates the
  preview's header; a brand with no invoices renders the placeholder body.
