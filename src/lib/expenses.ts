import { z } from "zod";

// One schema for three jobs: the shape Claude must return when reading an
// uploaded invoice, the check on a manual edit, and the stored record's type.
// Unknown values are null rather than left out, which structured output needs.
export const ExpenseFields = z.object({
  vendorName: z.string(),
  vendorGstin: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  /** YYYY-MM-DD */
  date: z.string().nullable(),
  /** ISO 4217, e.g. INR */
  currency: z.string(),
  items: z.array(
    z.object({
      description: z.string(),
      hsnSac: z.string().nullable(),
      quantity: z.number().nullable(),
      rate: z.number().nullable(),
      /** Before tax. */
      amount: z.number(),
      taxPercent: z.number().nullable(),
    })
  ),
  /** Before tax. */
  subtotal: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  /** Any tax that isn't CGST, SGST or IGST: cess, VAT, a foreign sales tax. */
  otherTax: z.number(),
  total: z.number(),
});
export type ExpenseFields = z.infer<typeof ExpenseFields>;

export interface Expense extends ExpenseFields {
  id: string;
  brandId: string;
  /** "failed": the file is stored but could not be read; fields are blank. */
  status: "ready" | "failed";
  fileName: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_EXPENSE_FIELDS: ExpenseFields = {
  vendorName: "",
  vendorGstin: null,
  invoiceNumber: null,
  date: null,
  currency: "INR",
  items: [],
  subtotal: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  otherTax: 0,
  total: 0,
};

export const EXPENSE_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_EXPENSE_FILE_BYTES = 10 * 1024 * 1024;

/** Why a file can't be uploaded, or null if it can. */
export function expenseFileProblem(file: { type: string; size: number }): string | null {
  if (!(EXPENSE_FILE_TYPES as readonly string[]).includes(file.type)) {
    return "Upload a PDF, JPEG, PNG or WebP file.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_EXPENSE_FILE_BYTES) return "That file is over 10 MB.";
  return null;
}

// Rounding on real invoices (round-off lines, per-line tax rounding) easily
// moves a total by a rupee, so only a larger gap is worth a person's attention.
const TOLERANCE = 1;

/**
 * Reasons a person should look at this expense before trusting it. An
 * extraction that doesn't add up is the main one: it usually means a misread
 * digit or a tax line that was missed.
 */
export function reviewReasons(e: Pick<Expense, "status"> & ExpenseFields): string[] {
  if (e.status === "failed") return ["This file couldn't be read. Enter the details by hand or try again."];
  const reasons: string[] = [];
  const tax = e.cgst + e.sgst + e.igst + e.otherTax;
  if (Math.abs(e.subtotal + tax - e.total) > TOLERANCE) {
    reasons.push("Subtotal plus tax doesn't add up to the total.");
  }
  const itemsSum = e.items.reduce((sum, item) => sum + item.amount, 0);
  if (e.items.length > 0 && Math.abs(itemsSum - e.subtotal) > TOLERANCE) {
    reasons.push("Line items don't add up to the subtotal.");
  }
  if (!e.date) reasons.push("No invoice date.");
  if (!e.vendorName.trim()) reasons.push("No vendor name.");
  return reasons;
}

/** Any ISO currency, unlike `formatCurrency`, which only knows the three invoices use. */
export function formatExpenseAmount(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    // Not a currency code Intl knows.
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Indian financial year (April to March) an expense falls in, by its start year. */
export function expenseFyStartYear(date: string | null): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? "");
  if (!m) return null;
  return Number(m[2]) >= 4 ? Number(m[1]) : Number(m[1]) - 1;
}
