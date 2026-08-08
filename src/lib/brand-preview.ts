import type { Currency, Invoice, InvoiceClient, LineItem } from "./types";

/**
 * The non-brand half of the invoice the brand form previews — everything
 * `InvoicePreviewProps` needs except `snapshot`, which the form supplies live
 * from its own state. Split this way because the two halves come from
 * genuinely different places: the brand half is whatever you are typing right
 * now, the invoice half is a real past invoice (or stand-in) that the brand
 * form never edits.
 */
export interface BrandPreviewBody {
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
 * Stand-in invoice contents for a brand that has never issued one — the whole
 * point of the preview is that a brand-new brand can see its design before
 * committing to it, which is exactly when no real invoice exists.
 *
 * Dates are fixed literals rather than derived from today so the preview (and
 * its tests) render identically on every run. They are visibly sample data
 * sitting next to sample line items, so a date that isn't this week costs
 * nothing; a preview that renders differently on two consecutive days would
 * cost a flaky test.
 */
const PLACEHOLDER_CLIENT: InvoiceClient = {
  name: "Priya Raman",
  companyName: "Northwind Studio",
  address: "48 Residency Road\nBengaluru 560025",
  email: "accounts@northwind.studio",
  gstNumber: "29AABCN1234M1Z7",
};

const PLACEHOLDER_ITEMS: LineItem[] = [
  // One taxed line and one untaxed one, so the preview always exercises both
  // the tax column and the subtotal/tax/total split — a single line item
  // would leave half of every design's money section unrendered.
  { id: "sample-1", description: "Brand identity design", amount: 120000, tax: 18 },
  { id: "sample-2", description: "Reimbursed printing costs", amount: 8500, tax: 0 },
];

const PLACEHOLDER_BILL_DATE = "2026-04-06";
const PLACEHOLDER_DUE_DATE = "2026-04-20";
const PLACEHOLDER_NOTES = "Payment due within 14 days. Thank you for your business.";

/**
 * The brand's most recent invoice, or `null` when there isn't one — a brand
 * that has never invoiced, or the create form, where `brandId` is `undefined`
 * because the brand has no id until it is first saved.
 *
 * "Most recent" is `createdAt`, not `billDate`: the preview is answering "what
 * do my invoices look like", so the one written most recently is the most
 * representative of how this brand is actually being used. A back-dated
 * invoice entered today is still the latest thing this brand produced.
 */
export function latestInvoiceForBrand(
  invoices: Invoice[],
  brandId: string | undefined
): Invoice | null {
  if (!brandId) return null;

  let latest: Invoice | null = null;
  for (const invoice of invoices) {
    if (invoice.brandId !== brandId) continue;
    // Strictly greater, so the earliest of several invoices sharing a
    // `createdAt` wins and the result is stable regardless of array order.
    if (!latest || invoice.createdAt > latest.createdAt) {
      latest = invoice;
    }
  }
  return latest;
}

/**
 * Fills the invoice half of the preview: the real invoice's contents when the
 * brand has one, placeholder contents when it doesn't.
 *
 * `invoicePrefix` is the brand form's *live* prefix field, and is only used
 * for the placeholder's invoice number — so typing a prefix on a new brand
 * updates the number in the preview. A real invoice keeps its own number
 * untouched: that number was assigned when it was issued, and rewriting it
 * here would show a document that never existed.
 */
export function brandPreviewBody(
  invoice: Invoice | null,
  invoicePrefix: string
): BrandPreviewBody {
  if (invoice) {
    return {
      client: invoice.client,
      invoiceNumber: invoice.invoiceNumber,
      billDate: invoice.billDate,
      dueDate: invoice.dueDate,
      items: invoice.items,
      currency: invoice.currency,
      notes: invoice.notes,
      isPaid: invoice.status === "paid",
    };
  }

  const prefix = invoicePrefix.trim().toUpperCase();
  return {
    client: PLACEHOLDER_CLIENT,
    invoiceNumber: `${prefix || "INV"}-2026-001`,
    billDate: PLACEHOLDER_BILL_DATE,
    dueDate: PLACEHOLDER_DUE_DATE,
    items: PLACEHOLDER_ITEMS,
    currency: "INR",
    notes: PLACEHOLDER_NOTES,
    // A sample invoice is never shown as paid — the "Paid" stamp is a claim
    // about a real document, and stamping made-up data with it is noise.
    isPaid: false,
  };
}
