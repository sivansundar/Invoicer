import type { FollowupConfig, Invoice } from "./types";
import { formatCurrency } from "./utils";
import { formatStoredDate } from "./dates";
import { daysLate } from "./dashboard";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const TEMPLATE_TOKENS = [
  "client",
  "company",
  "invoice",
  "amount",
  "due_date",
  "days_late",
  "brand",
] as const;

export function timeLabel(time: string): string {
  const [hours, minutes] = (time || "09:00").split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function cadenceLabel(config: FollowupConfig): string {
  if (!config.enabled) return "Follow-ups off";
  if (config.mode === "weekly") {
    return `Every week after the due date · ${timeLabel(config.time)}`;
  }
  const unit = config.repeat === "month" ? "month" : "week";
  return `Every ${unit} on ${DAYS[config.weekday]} · ${timeLabel(config.time)}`;
}

/**
 * Adds months without rolling past the end of a shorter target month —
 * `Date#setMonth` on a month-end anchor (e.g. 31 Jan) overflows into the
 * following month (3 Mar, skipping Feb entirely) rather than clamping to the
 * target month's last day (28 Feb).
 */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
}

/**
 * The first scheduled slot after the last reminder (or the due date).
 * Null means nothing more will be sent for this invoice.
 */
export function nextSendDate(
  invoice: Invoice,
  config: FollowupConfig,
  today: Date = new Date()
): Date | null {
  void today;
  if (!config.enabled) return null;
  if (invoice.status === "paid" || invoice.status === "draft") return null;
  if (invoice.followupsPaused) return null;

  const sent = invoice.reminders ?? [];
  if (config.stopAfter > 0 && sent.length >= config.stopAfter) return null;

  const anchor = sent.length > 0 ? sent[sent.length - 1] : invoice.dueDate;
  const start = new Date(`${anchor}T00:00`);
  // An unparseable anchor (e.g. an empty due date, reachable if a draft with
  // no due date is marked sent, or via imported/hand-edited data) produces an
  // Invalid Date — a truthy object that would otherwise be returned as if a
  // real send were scheduled. Treat it as "nothing to schedule" instead.
  if (Number.isNaN(start.getTime())) return null;

  let date: Date;
  if (config.mode === "custom" && config.repeat === "month") {
    date = addMonthsClamped(start, 1);
  } else {
    date = new Date(start);
    date.setDate(date.getDate() + 7);
  }

  if (config.mode === "custom") {
    date.setDate(date.getDate() + ((config.weekday - date.getDay() + 7) % 7));
  }

  return date;
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
