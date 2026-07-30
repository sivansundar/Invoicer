import { resolveInvoiceDesign } from "@/lib/invoice-design";
import { ModernInvoicePreview } from "./designs/modern-invoice-preview";
import { ClassicInvoicePreview } from "./designs/classic-invoice-preview";
import type { InvoicePreviewProps } from "./designs/props";

export type { InvoicePreviewProps };

/**
 * Dispatches to one of the two on-screen invoice designs based on
 * `snapshot.invoiceDesign` — never a live brand lookup, so the invoice
 * detail screen and the invoice editor both render whatever design the
 * snapshot they're passed actually carries. Consumed by the invoice detail
 * screen (a saved `Invoice`'s snapshot) and the invoice editor (unsaved form
 * state, including a live brand's snapshot while nothing has been saved
 * yet) — purely presentational either way, so it only ever takes these
 * primitives, never an `Invoice`.
 *
 * Each design is its own component (`ModernInvoicePreview`,
 * `ClassicInvoicePreview`) rather than one component branching on design
 * throughout its JSX — that stays maintainable as more designs are added,
 * where a single conditional-laden component would not.
 */
export function InvoicePreview(props: InvoicePreviewProps) {
  const design = resolveInvoiceDesign(props.snapshot.invoiceDesign);
  return design === "classic" ? <ClassicInvoicePreview {...props} /> : <ModernInvoicePreview {...props} />;
}
