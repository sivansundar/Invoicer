import type { Invoice } from "./types";
import { formatCurrency } from "./utils";
import { formatStoredDate } from "./dates";
import { daysLate } from "./dashboard";

/**
 * Removed with the cadence they described: `DAYS`, `timeLabel`,
 * `cadenceLabel` and `nextSendDate`. A stage fires once at an offset from the
 * due date rather than repeating on a weekday at a time, so a weekday picker,
 * a time formatter and a weekly-vs-monthly step function had nothing left to
 * compute. `@/lib/reminder-stages` owns scheduling now, and owns it alone —
 * two answers to "when does the next reminder go" is the drift this whole
 * feature was shaped to avoid.
 */

export const TEMPLATE_TOKENS = [
  "client",
  "company",
  "invoice",
  "amount",
  "due_date",
  "days_late",
  "brand",
] as const;

/**
 * `{{token}}` syntax for a known template token, typed against
 * `TEMPLATE_TOKENS` so a hardcoded reference to e.g. `{{brand}}` elsewhere
 * (the template-form preview's zero-invoice fallback) fails to compile
 * rather than silently drifting if a token is ever renamed.
 */
export function tokenPlaceholder(token: (typeof TEMPLATE_TOKENS)[number]): string {
  return `{{${token}}}`;
}

/**
 * Whether an invoice is still owed money and therefore eligible for a
 * follow-up — "sent" or "overdue". Shared by the follow-ups queue and the
 * per-brand follow-up card so the two can't drift on what "unpaid" means.
 */
export function isUnpaid(invoice: Invoice): boolean {
  return invoice.status === "sent" || invoice.status === "overdue";
}

export function fillTemplate(text: string, context: Record<string, string>): string {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in context ? context[key] : match
  );
}

// Embedded into a full sentence in a reminder email body/subject (see
// seed.ts's templates: "...was due on {{due_date}}."), not a table cell, so
// the fallback is a short phrase that keeps the sentence readable rather than
// a bare "—" or the literal string "Invalid Date" that `toLocaleDateString`
// would otherwise silently produce for an empty/malformed stored due date.
function formatLongDate(value: string): string {
  return formatStoredDate(value, "d MMM yyyy", "an unspecified date");
}

export function templateContext(
  invoice: Invoice,
  brandName: string,
  today: Date = new Date()
): Record<string, string> {
  // Delegates to `daysLate` (`@/lib/dashboard`) rather than duplicating the
  // calculation inline, as the old comment here only aspired to ("mirrors the
  // days_late calculation") — a duplicated formula is exactly how this file's
  // copy went unguarded against an empty/malformed `dueDate` producing
  // `Math.round(NaN)` === `NaN`, which `String()` would render as the literal
  // "NaN" into a reminder email subject (e.g. seed.ts's
  // "{{days_late}} days past due").
  return {
    invoice: invoice.invoiceNumber,
    client: invoice.client?.name || invoice.client?.companyName || "there",
    company: invoice.client?.companyName ?? "—",
    amount: formatCurrency(invoice.total, invoice.currency ?? "INR"),
    due_date: formatLongDate(invoice.dueDate),
    days_late: String(daysLate(invoice, today)),
    brand: brandName,
  };
}
