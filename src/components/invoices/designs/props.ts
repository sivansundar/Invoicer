import type { BrandSnapshot, Currency, Invoice, InvoiceClient, LineItem } from "@/lib/types";

/**
 * Shared prop shape for every on-screen invoice design (`ModernInvoicePreview`,
 * `ClassicInvoicePreview`, …). Deliberately primitives, not an `Invoice` —
 * `InvoicePreview` (the dispatcher in `../invoice-preview.tsx`) is used by
 * both the invoice detail screen (reading from a saved `Invoice`) and the
 * invoice editor (reading from unsaved form state that never becomes one),
 * so every design must take the same narrow, invoice-shaped-but-not-invoice
 * props rather than assuming a persisted record exists.
 */
export interface InvoicePreviewProps {
  snapshot: BrandSnapshot;
  client: InvoiceClient;
  invoiceNumber: string;
  billDate: string;
  dueDate: string;
  items: LineItem[];
  currency: Currency;
  notes: string | undefined;
  isPaid: boolean;
}

/**
 * Shared prop shape for every PDF invoice design (`ModernInvoicePDF`,
 * `ClassicInvoicePDF`, …). Unlike `InvoicePreviewProps`, this does take the
 * full `Invoice` — the PDF is only ever generated for a persisted invoice —
 * but `snapshot` is still passed explicitly and must always be
 * `invoice.brandSnapshot`, never a live brand lookup, so a brand edited
 * after an invoice was issued can never change the document a client
 * already received.
 */
export interface InvoicePDFProps {
  invoice: Invoice;
  snapshot: BrandSnapshot;
}
