import type { AchDetails, BankDetails, LineItem, PaymentMethod } from "./types";

export interface InvoiceTotals {
  subtotal: number;
  totalTax: number;
  total: number;
}

/**
 * Single source of truth for subtotal/tax/total, shared by the invoice form
 * (which persists these figures on the saved `Invoice`) and the live preview
 * (which re-derives them from unsaved form state). `totalTax` is rounded to
 * 2dp — floating point line-item math (e.g. 33.33 * 18 / 100) can otherwise
 * produce a total that silently disagrees between the two call sites by a
 * fraction of a cent.
 */
export function computeTotals(items: LineItem[]): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const totalTax =
    Math.round(items.reduce((sum, item) => sum + (item.amount * item.tax) / 100, 0) * 100) / 100;
  return { subtotal, totalTax, total: subtotal + totalTax };
}

/**
 * The tax line on the client-facing preview reads "GST {n}%" only when every
 * taxed line item shares the exact same non-zero rate — otherwise the mix of
 * rates can't be summarized by a single percentage, so it falls back to the
 * generic "Tax" label. Items with a zero rate are ignored: they don't count
 * toward "more than one rate" and don't produce a rate of their own.
 */
export function taxLabel(items: LineItem[]): string {
  const rates = new Set(items.map((item) => item.tax).filter((tax) => tax > 0));
  return rates.size === 1 ? `GST ${[...rates][0]}%` : "Tax";
}

export interface PaymentDetailField {
  label: string;
  value: string;
}

const IFSC_FIELD_ORDER: Array<{ label: string; key: keyof BankDetails }> = [
  { label: "Account name", key: "accountName" },
  { label: "Bank", key: "bankName" },
  { label: "Branch", key: "branch" },
  { label: "Account number", key: "accountNumber" },
  { label: "IFSC", key: "ifscCode" },
  { label: "UPI ID", key: "upiId" },
];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const ACH_FIELD_ORDER: Array<{
  label: string;
  key: keyof AchDetails;
  format?: (raw: string) => string;
}> = [
  { label: "Account name", key: "accountName" },
  { label: "Bank", key: "bankName" },
  { label: "Account number", key: "accountNumber" },
  { label: "ACH routing number", key: "routingNumber" },
  // `accountType` is stored lowercase ("checking"/"savings", matching the
  // form's <select> values) but every other payment field prints
  // sentence-case ("Account name", not "account name") — `format` is only on
  // this one field because it's the only one whose raw stored value isn't
  // already client-facing text.
  { label: "Account type", key: "accountType", format: capitalize },
];

/**
 * Ordered, non-empty payment fields for the "Payment details" block.
 * `method === "ach"` renders `achDetails` in ACH field order; anything else
 * (`"ifsc"`, `undefined`) renders `bankDetails` in IFSC field order — the
 * same fallback `resolvePaymentMethod` (`@/lib/types`) documents. A
 * snapshot frozen as `"ach"` before its brand ever had `achDetails` set
 * (impossible going forward, since the invoice form disables that option
 * until the brand has one, but not ruled out for older/imported data) also
 * falls back to IFSC here rather than rendering an empty ACH block. Returns
 * an empty array when every field in the chosen set is blank, which callers
 * use to skip rendering the block entirely rather than showing an empty
 * bordered box.
 */
export function paymentDetailFields(
  bankDetails: BankDetails | undefined,
  achDetails: AchDetails | undefined,
  method: PaymentMethod | undefined
): PaymentDetailField[] {
  if (method === "ach" && achDetails) {
    return ACH_FIELD_ORDER.map(({ label, key, format }) => {
      const raw = (achDetails[key] ?? "").trim();
      return { label, value: raw && format ? format(raw) : raw };
    }).filter((field) => field.value !== "");
  }
  if (!bankDetails) return [];
  return IFSC_FIELD_ORDER.map(({ label, key }) => ({
    label,
    value: (bankDetails[key] ?? "").trim(),
  })).filter((field) => field.value !== "");
}

/**
 * Chunks payment-detail fields into rows of (up to) two, for renderers that
 * must lay out the two-column payment grid by hand rather than with CSS
 * grid — namely the PDF, which is built with `@react-pdf/renderer`'s
 * flexbox-only layout. A trailing odd field forms its own row of one, which
 * callers render at full width instead of leaving a paired cell empty.
 */
export function chunkPaymentFieldRows(
  fields: PaymentDetailField[]
): PaymentDetailField[][] {
  const rows: PaymentDetailField[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    rows.push(fields.slice(i, i + 2));
  }
  return rows;
}
