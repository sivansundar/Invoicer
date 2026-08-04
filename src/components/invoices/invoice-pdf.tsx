"use client";

import { ModernInvoicePDF } from "./designs/modern-invoice-pdf";
import { ClassicInvoicePDF } from "./designs/classic-invoice-pdf";
import type { InvoicePDFProps } from "./designs/props";

export type { InvoicePDFProps };

/**
 * Dispatches to one of the two PDF invoice designs. The design comes from
 * `snapshot.invoiceDesign` — and `snapshot` here is always
 * `invoice.brandSnapshot` (see every call site: `pdf-download-button.tsx`),
 * never a live brand lookup — so a brand's design can be changed at any
 * time without altering the PDF of an invoice already issued under the old
 * one. Read directly rather than through `resolveInvoiceDesign`: `snapshot`
 * is an already-constructed, typed `BrandSnapshot`, where `invoiceDesign` is
 * required, not raw stored JSON — that boundary is `migrate.ts`'s job, not
 * this dispatcher's. Anything other than `"classic"` renders modern, the
 * same default `resolveInvoiceDesign` would have produced.
 *
 * Each design is its own component (`ModernInvoicePDF`, `ClassicInvoicePDF`)
 * rather than one component branching on design throughout its JSX — that
 * stays maintainable as more designs are added, where a single
 * conditional-laden component would not.
 */
export function InvoicePDF({ invoice, snapshot }: InvoicePDFProps) {
  return snapshot.invoiceDesign === "classic" ? (
    <ClassicInvoicePDF invoice={invoice} snapshot={snapshot} />
  ) : (
    <ModernInvoicePDF invoice={invoice} snapshot={snapshot} />
  );
}
