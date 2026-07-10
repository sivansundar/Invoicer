# Financial Year Summary Report — Design

**Date:** 2026-07-10

## Goal
Generate a PDF summary report of invoices for a chosen financial year and month
range, with a live preview before download.

## Flow
"Summary Report" button (dashboard header) → config modal → **Generate** → live
PDF preview → **Confirm & Download** → PDF saved.

## Decisions
- **Financial year = Apr–Mar** (Indian FY). FY dropdown lists years derived from
  actual invoice bill dates. "From month" / "To month" are month-only in FY order
  (April…March); logic maps Apr–Dec → first calendar year, Jan–Mar → second.
- **Invoices filtered by `billDate`** falling in the resolved range.
- **Status filter**: checkboxes (Paid / Sent / Overdue on by default, Draft off).
- **Brand filter**: select, default "All brands".
- **Multi-currency**: totals grouped per currency (INR/USD/SGD), never summed
  across currencies — mirrors dashboard behaviour.
- **Preview is the real PDF**: `@react-pdf/renderer` `<PDFViewer>` renders the same
  `<SummaryReportPDF>` document shown in-modal; confirm calls `pdf(...).toBlob()`
  on the identical document. Single source of truth, no drift.
- **Empty result**: inline "No invoices match" message, generation blocked.

## Components
| Piece | File | Responsibility |
|---|---|---|
| Report logic | `src/lib/reports.ts` | Derive FYs, resolve range, filter, aggregate. Pure + tested. |
| Report PDF | `src/components/reports/summary-report-pdf.tsx` | `<Document>`: summary block + invoice table with per-currency subtotals. |
| Report modal | `src/components/reports/summary-report-dialog.tsx` | Button + Dialog with configure/preview steps. |
| Wire-in | `src/app/page.tsx` | Button in dashboard header. |
| Tests | `src/lib/reports.test.ts` | FY range resolution, filtering, aggregation. |

## Report content (PDF)
- Header: "Financial Year Summary", FY label, month range, brand (or "All brands"),
  generated date.
- Summary: invoice count, totals per currency, status breakdown.
- Table: one row per invoice (number, date, client, status, total), grouped by
  currency with per-currency subtotals.
