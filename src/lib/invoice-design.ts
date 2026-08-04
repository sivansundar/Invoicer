import type { InvoiceDesign } from "./types";

/**
 * The design every brand (and every `BrandSnapshot` frozen before this field
 * existed) renders as when nothing else says otherwise — "Modern" is what
 * this branch shipped with before per-brand designs existed, so it's the
 * only default that doesn't change how anyone's invoices already look.
 */
export const DEFAULT_INVOICE_DESIGN: InvoiceDesign = "modern";

/**
 * The single place that turns a possibly-`undefined` `invoiceDesign` (an old
 * `Brand`/`BrandSnapshot` written before this field existed, or one a caller
 * simply forgot to set) into a concrete design to render. Every read of
 * `Brand.invoiceDesign` or `BrandSnapshot.invoiceDesign` — the chooser, the
 * preview dispatcher, the PDF dispatcher, migration's backfill — must go
 * through this rather than inlining `?? "modern"`, so the default only ever
 * has to be decided in one place.
 */
export function resolveInvoiceDesign(design: InvoiceDesign | undefined): InvoiceDesign {
  return design ?? DEFAULT_INVOICE_DESIGN;
}

export interface InvoiceDesignOption {
  value: InvoiceDesign;
  label: string;
  description: string;
}

/**
 * Drives the brand-form chooser. Order here is display order (Modern first,
 * matching it being the default), and the description is what lets someone
 * pick correctly without having to create a test invoice first.
 */
export const INVOICE_DESIGN_OPTIONS: InvoiceDesignOption[] = [
  {
    value: "modern",
    label: "Modern",
    description: "Minimal layout with a compact header and a soft payment card.",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Traditional tax-invoice layout with a ruled item table.",
  },
];
