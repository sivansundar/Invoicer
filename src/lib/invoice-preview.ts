import type { BankDetails, LineItem } from "./types";

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

const PAYMENT_FIELD_ORDER: Array<{ label: string; key: keyof BankDetails }> = [
  { label: "Account name", key: "accountName" },
  { label: "Bank", key: "bankName" },
  { label: "Branch", key: "branch" },
  { label: "Account number", key: "accountNumber" },
  { label: "IFSC", key: "ifscCode" },
  { label: "UPI ID", key: "upiId" },
];

/**
 * Ordered, non-empty payment fields for the "Payment details" block. Returns
 * an empty array when every bank field is blank, which callers use to skip
 * rendering the block entirely rather than showing an empty bordered box.
 */
export function paymentDetailFields(bankDetails: BankDetails | undefined): PaymentDetailField[] {
  if (!bankDetails) return [];
  return PAYMENT_FIELD_ORDER.map(({ label, key }) => ({
    label,
    value: (bankDetails[key] ?? "").trim(),
  })).filter((field) => field.value !== "");
}
