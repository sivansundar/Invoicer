import type { AchDetails, BankDetails, GstType, LineItem, PaymentMethod } from "./types";
import { GST_STATES } from "./gst-states";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";

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

/** "Net 30" from the bill → due gap, "Due on receipt" at 0 days; undefined when a date is missing or the gap is negative. */
export function paymentTerms(billDate: string, dueDate: string): string | undefined {
  const bill = parseISO(billDate);
  const due = parseISO(dueDate);
  if (!isValid(bill) || !isValid(due)) return undefined;
  const days = differenceInCalendarDays(due, bill);
  if (days < 0) return undefined;
  return days === 0 ? "Due on receipt" : `Net ${days}`;
}

export function lineQuantity(item: LineItem): number {
  return item.quantity ?? 1;
}

export function lineRate(item: LineItem): number {
  return item.rate ?? item.amount;
}

/** quantity × rate, rounded to paise so the stored `amount` never carries float noise. */
export function lineAmount(quantity: number, rate: number): number {
  return Math.round(quantity * rate * 100) / 100;
}

export interface TaxRow {
  label: string;
  amount: number;
}

/** `name` plus an optional " {rate}%" suffix when every taxed line shares one rate (see `taxLabel`). */
function rateLabel(name: string, items: LineItem[], divisor = 1): string {
  const rates = new Set(items.map((item) => item.tax).filter((tax) => tax > 0));
  return rates.size === 1 ? `${name} ${[...rates][0] / divisor}%` : name;
}

/**
 * The tax rows under the subtotal. CGST + SGST split the rate in half; SGST
 * takes the rounding remainder so the two always sum to `totalTax`. A legacy
 * invoice (no `gstType`) keeps its single `taxLabel` row.
 */
export function taxRows(items: LineItem[], gstType: GstType | undefined): TaxRow[] {
  const { totalTax } = computeTotals(items);
  switch (gstType) {
    case "cgst_sgst": {
      const cgst = Math.round(items.reduce((sum, item) => sum + (item.amount * item.tax) / 200, 0) * 100) / 100;
      return [
        { label: rateLabel("CGST", items, 2), amount: cgst },
        { label: rateLabel("SGST", items, 2), amount: Math.round((totalTax - cgst) * 100) / 100 },
      ];
    }
    case "igst":
      return [{ label: rateLabel("IGST", items), amount: totalTax }];
    case "export_lut":
      return [{ label: "IGST 0%", amount: 0 }];
    default:
      return [{ label: taxLabel(items), amount: totalTax }];
  }
}

/** "Karnataka (29)" / "Other country (96)" for the Billed-to block; undefined when unknown. */
export function placeOfSupply(gstType: GstType | undefined, stateCode: string | undefined): string | undefined {
  if (!gstType) return undefined;
  const code = gstType === "export_lut" ? "96" : stateCode;
  const name = code && GST_STATES[code];
  return name ? `${name} (${code})` : undefined;
}

/** "TAX INVOICE" once GST applies and the brand is registered; the legacy "INVOICE" otherwise. */
export function invoiceTitle(gstType: GstType | undefined, brandGstNumber: string | undefined): string {
  return gstType && brandGstNumber ? "TAX INVOICE" : "INVOICE";
}

export const EXPORT_DECLARATION =
  "Supply meant for export under bond or letter of undertaking without payment of integrated tax";

export function exportDeclaration(lutArn: string | undefined, purposeCode?: string): string {
  const lut = lutArn ? `${EXPORT_DECLARATION}, LUT: ${lutArn}` : EXPORT_DECLARATION;
  return purposeCode ? `${lut}. Purpose code: ${purposeCode}` : lut;
}

/** Country of destination line, only on export invoices. */
export function countryLine(gstType: GstType | undefined, country: string | undefined): string | undefined {
  return gstType === "export_lut" && country ? `Country: ${country}` : undefined;
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
  // `accountType` is stored lowercase ("current"/"savings", matching the
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
 * falls back to IFSC here rather than rendering an empty ACH block.
 * `showAchAccountType` is the invoice's own per-invoice choice
 * (`Invoice.showAchAccountType`) — the brand may store an account type the
 * user doesn't want printed on a given invoice. It has no effect on the
 * IFSC block. Returns
 * an empty array when every field in the chosen set is blank, which callers
 * use to skip rendering the block entirely rather than showing an empty
 * bordered box.
 */
export function paymentDetailFields(
  bankDetails: BankDetails | undefined,
  achDetails: AchDetails | undefined,
  method: PaymentMethod | undefined,
  showAchAccountType: boolean | undefined
): PaymentDetailField[] {
  if (method === "ach" && achDetails) {
    return ACH_FIELD_ORDER.filter(({ key }) => key !== "accountType" || showAchAccountType).map(({ label, key, format }) => {
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
