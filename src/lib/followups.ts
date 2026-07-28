import type { FollowupConfig, Invoice } from "./types";
import { formatCurrency } from "./utils";

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

function formatLongDate(value: string): string {
  return new Date(`${value}T00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function templateContext(
  invoice: Invoice,
  brandName: string,
  today: Date = new Date()
): Record<string, string> {
  const midnight = new Date(today.toDateString());
  const daysLate = Math.max(
    Math.round((midnight.getTime() - new Date(`${invoice.dueDate}T00:00`).getTime()) / 864e5),
    0
  );

  return {
    invoice: invoice.invoiceNumber,
    client: invoice.client?.name || invoice.client?.companyName || "there",
    company: invoice.client?.companyName ?? "—",
    amount: formatCurrency(invoice.total, invoice.currency ?? "INR"),
    due_date: formatLongDate(invoice.dueDate),
    days_late: String(daysLate),
    brand: brandName,
  };
}
