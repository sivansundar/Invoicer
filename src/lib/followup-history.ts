import type { Invoice } from "./types";
import { groupTotalsByCurrency, type CurrencyGroup } from "./money";

/**
 * Per-brand follow-up history — what has already gone out, and whether any of
 * it worked.
 *
 * Everything here is derived from `Invoice.reminders` (the `yyyy-MM-dd` dates
 * a reminder was recorded), `status` and `paidOn`. That is the whole record.
 * In particular:
 *
 * - **Reminders are identified by ordinal, not by name.** A brand has one
 *   `FollowupConfig` — a single repeating cadence and a single `templateId` —
 *   so every reminder it sends is identical in content. The only thing
 *   distinguishing the second from the first is that it is the second. A
 *   named multi-step sequence would need a schema change; see
 *   docs/redesign/02-followup-history.md.
 * - **There is no open or click tracking.** Nothing sends email yet, and no
 *   provider webhook exists, so no outcome here claims a reminder was read.
 */

/** Days after a reminder within which a payment is attributed to it. */
export const RECOVERY_WINDOW_DAYS = 7;

/** Below this many reminders at an ordinal, a recovery rate is noise. */
export const MIN_SAMPLE_FOR_RATE = 3;

export type ReminderOutcome = "paid" | "escalated" | "pending" | "unknown";

export interface ReminderEvent {
  invoice: Invoice;
  /** "yyyy-MM-dd". */
  sentOn: string;
  /** 1-indexed position within this invoice's reminder history. */
  ordinal: number;
  outcome: ReminderOutcome;
  /** Days from this reminder to payment; only set when `outcome` is "paid". */
  daysToPayment: number | null;
}

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  // Local midnight, matching every other date anchor in this codebase — never
  // toISOString(), which shifts a stored calendar date backwards a day for
  // timezones ahead of UTC.
  const date = new Date(`${value}T00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 864e5);
}

/**
 * Every reminder ever recorded against these invoices, newest first.
 *
 * Callers pass an already-brand-filtered list, which keeps this function
 * brand-agnostic and directly testable.
 */
export function brandReminderHistory(invoices: Invoice[]): ReminderEvent[] {
  const events: ReminderEvent[] = [];

  for (const invoice of invoices) {
    const reminders = [...(invoice.reminders ?? [])]
      .filter((value) => toDate(value) !== null)
      .sort();
    if (reminders.length === 0) continue;

    const paidOn = invoice.status === "paid" ? toDate(invoice.paidOn) : null;

    reminders.forEach((sentOn, index) => {
      const sentDate = toDate(sentOn)!;
      const isLast = index === reminders.length - 1;

      let outcome: ReminderOutcome;
      let daysToPayment: number | null = null;

      if (!isLast) {
        // A later reminder went out, so this one did not end the chase.
        outcome = "escalated";
      } else if (invoice.status !== "paid") {
        outcome = "pending";
      } else if (paidOn === null) {
        // Paid, but paidOn is undefined — an invoice settled before that
        // field existed. Never backfilled, so the date is genuinely unknown.
        outcome = "unknown";
      } else {
        const gap = daysBetween(sentDate, paidOn);
        if (gap < 0) {
          // A reminder dated after payment is corrupt rather than meaningful.
          outcome = "unknown";
        } else {
          outcome = "paid";
          daysToPayment = gap;
        }
      }

      events.push({ invoice, sentOn, ordinal: index + 1, outcome, daysToPayment });
    });
  }

  return events.sort((a, b) => b.sentOn.localeCompare(a.sentOn));
}

export interface MonthGroup {
  /** "yyyy-MM", for keys and sorting. */
  key: string;
  events: ReminderEvent[];
  /** Totals of the invoices recovered in this month, grouped by currency. */
  recovered: CurrencyGroup[];
}

/** Groups events by calendar month, newest month first. */
export function groupEventsByMonth(events: ReminderEvent[]): MonthGroup[] {
  const byMonth = new Map<string, ReminderEvent[]>();

  for (const event of events) {
    const key = event.sentOn.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(event);
    else byMonth.set(key, [event]);
  }

  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, monthEvents]) => ({
      key,
      events: monthEvents,
      // One invoice can be recovered only once, even if several of its
      // reminders fall in the same month.
      recovered: groupTotalsByCurrency(
        [
          ...new Map(
            monthEvents
              .filter((event) => event.outcome === "paid")
              .map((event) => [event.invoice.id, event.invoice])
          ).values(),
        ]
      ),
    }));
}

export interface FollowupSummary {
  remindersSent: number;
  invoicesChased: number;
  /** Invoices paid with at least one reminder at or before payment. */
  recoveredCount: number;
  recovered: CurrencyGroup[];
  /** Mean reminders it took, over recovered invoices. Null when none. */
  avgRemindersToPayment: number | null;
  /** Recovered ÷ chased-and-paid, as a percentage. Null when none were paid. */
  paysAfterNudgePct: number | null;
  /** Chased invoices still unpaid. */
  stillUnanswered: number;
}

export function brandFollowupSummary(invoices: Invoice[]): FollowupSummary {
  const chased = invoices.filter((invoice) => (invoice.reminders?.length ?? 0) > 0);
  const remindersSent = chased.reduce((sum, invoice) => sum + invoice.reminders.length, 0);

  const chasedAndPaid = chased.filter((invoice) => invoice.status === "paid");
  const recoveredInvoices = chasedAndPaid.filter((invoice) => {
    const paidOn = toDate(invoice.paidOn);
    if (!paidOn) return false;
    return invoice.reminders.some((sentOn) => {
      const sent = toDate(sentOn);
      return sent !== null && daysBetween(sent, paidOn) >= 0;
    });
  });

  const avgRemindersToPayment =
    recoveredInvoices.length === 0
      ? null
      : Math.round(
          (recoveredInvoices.reduce((sum, invoice) => sum + invoice.reminders.length, 0) /
            recoveredInvoices.length) *
            10
        ) / 10;

  return {
    remindersSent,
    invoicesChased: chased.length,
    recoveredCount: recoveredInvoices.length,
    recovered: groupTotalsByCurrency(recoveredInvoices),
    avgRemindersToPayment,
    paysAfterNudgePct:
      chasedAndPaid.length === 0
        ? null
        : Math.round((recoveredInvoices.length / chasedAndPaid.length) * 100),
    stillUnanswered: chased.filter((invoice) => invoice.status !== "paid").length,
  };
}

export interface OrdinalRecovery {
  ordinal: number;
  /** Invoices that received a reminder at this ordinal. */
  sent: number;
  /** Of those, how many were paid within RECOVERY_WINDOW_DAYS of it. */
  recovered: number;
  /** Null when `sent` is below MIN_SAMPLE_FOR_RATE — too few to mean anything. */
  pct: number | null;
}

/**
 * Recovery rate by reminder ordinal: of every invoice that received an Nth
 * reminder, the share paid within a week of it.
 *
 * This is the question the screen exists to answer — whether the cadence is
 * too slow — and it is well-defined even though every reminder carries the
 * same template, because the ordinal is what varies.
 */
export function recoveryByOrdinal(invoices: Invoice[]): OrdinalRecovery[] {
  const sent = new Map<number, number>();
  const recovered = new Map<number, number>();

  for (const invoice of invoices) {
    const reminders = [...(invoice.reminders ?? [])].filter((v) => toDate(v) !== null).sort();
    if (reminders.length === 0) continue;
    const paidOn = invoice.status === "paid" ? toDate(invoice.paidOn) : null;

    reminders.forEach((sentOn, index) => {
      const ordinal = index + 1;
      sent.set(ordinal, (sent.get(ordinal) ?? 0) + 1);
      if (!paidOn) return;
      const gap = daysBetween(toDate(sentOn)!, paidOn);
      if (gap >= 0 && gap <= RECOVERY_WINDOW_DAYS) {
        recovered.set(ordinal, (recovered.get(ordinal) ?? 0) + 1);
      }
    });
  }

  return [...sent.keys()]
    .sort((a, b) => a - b)
    .map((ordinal) => {
      const sentCount = sent.get(ordinal)!;
      const recoveredCount = recovered.get(ordinal) ?? 0;
      return {
        ordinal,
        sent: sentCount,
        recovered: recoveredCount,
        pct:
          sentCount < MIN_SAMPLE_FOR_RATE
            ? null
            : Math.round((recoveredCount / sentCount) * 100),
      };
    });
}

/** Display copy for an outcome. Kept beside the rules that produce them. */
export function outcomeLabel(event: ReminderEvent): string {
  switch (event.outcome) {
    case "paid":
      return event.daysToPayment === 0
        ? "Paid same day"
        : `Paid ${event.daysToPayment} ${event.daysToPayment === 1 ? "day" : "days"} later`;
    case "escalated":
      return `Followed by reminder ${event.ordinal + 1}`;
    case "pending":
      return "No reply yet";
    case "unknown":
      return "Paid, date unknown";
  }
}
