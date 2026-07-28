import type { FollowupConfig, Invoice } from "./types";
import { formatCurrency } from "./utils";
import { formatStoredDate } from "./dates";
import { daysLate } from "./dashboard";

// Exported for the follow-ups screen's custom-cadence "Day" picker — sharing
// this table (rather than a second copy in the component) keeps the label
// used there identical to the one `cadenceLabel` renders for the same index.
export const DAYS = [
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
 * Advances `date` by exactly one cadence step (one week, or one month in
 * custom-monthly), re-landing on the configured weekday for custom mode
 * afterwards. Split out of `nextSendDate` so the same single step can be
 * both the first hop off the anchor and, when that lands in the past, every
 * subsequent hop while catching up to `today` (see `nextSendDate`).
 */
function advanceOneStep(date: Date, config: FollowupConfig): Date {
  const stepped =
    config.mode === "custom" && config.repeat === "month"
      ? addMonthsClamped(date, 1)
      : (() => {
          const d = new Date(date);
          d.setDate(d.getDate() + 7);
          return d;
        })();

  if (config.mode === "custom") {
    stepped.setDate(stepped.getDate() + ((config.weekday - stepped.getDay() + 7) % 7));
  }

  return stepped;
}

/**
 * The next scheduled slot on or after `today`. Null means nothing more will
 * be sent for this invoice.
 *
 * The naive "one step off the last event" slot can land in the past — an
 * invoice that's sat sent-but-unpaid for a month on a weekly cadence, or one
 * imported with old reminder history, both compute a first hop that already
 * happened. Rather than report that stale date as what's "going out next"
 * (the follow-ups queue's own heading), this keeps stepping forward by the
 * same cadence until it reaches a slot that hasn't passed — the same thing a
 * real cron-style scheduler does when it wakes up late. A slot that lands
 * exactly on `today` is left alone (not rolled to next week) — the day
 * hasn't happened yet.
 */
export function nextSendDate(
  invoice: Invoice,
  config: FollowupConfig,
  today: Date = new Date()
): Date | null {
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

  let date = advanceOneStep(start, config);

  const todayMidnight = new Date(today.toDateString());
  while (date.getTime() < todayMidnight.getTime()) {
    date = advanceOneStep(date, config);
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
