import type { Brand, Invoice } from "./types";
import { isUnpaid } from "./followups";
import {
  nextScheduledReminder,
  reminderSchedule,
  stagePosition,
  type ReminderStage,
  type SentReminder,
} from "./reminder-stages";

export interface FollowupQueueEntry {
  invoice: Invoice;
  brand: Brand;
  /** The next scheduled slot for this invoice's next reminder. */
  scheduled: Date;
  /** 1-indexed — which of the three stages this slot is. */
  reminderNumber: number;
  /** Which stage, so the queue can name it rather than only number it. */
  stage: ReminderStage;
}

/**
 * Every sent/overdue invoice with a live schedule, sorted so the soonest
 * send is first. Delegates entirely to `nextSendDate` (`@/lib/followups`)
 * for the actual scheduling maths — a second implementation here is exactly
 * how this queue and the invoice detail card's own "next send" line could
 * come to disagree.
 *
 * Two records this always has to survive without throwing or leaking a bad
 * row: an invoice with a missing/unparseable due date (`nextSendDate`
 * already returns `null` for that — dropped like any other `null`), and an
 * invoice whose brand has since been deleted (`deleteBrand` never cascades
 * to its invoices) — skipped here since there's no `FollowupConfig` left to
 * schedule against.
 */
export function buildFollowupQueue(
  invoices: Invoice[],
  brands: Brand[],
  /**
   * What has actually been sent, per invoice, from `reminder_sends`.
   *
   * Passed in rather than inferred from `invoice.reminders`, which holds only
   * dates. Reading the stage from a date's position in that array is wrong
   * exactly when it matters: the scheduler jumps straight to the final notice
   * on an invoice already months late, and a positional reading would call
   * that first entry a nudge and then promise a follow-up that never comes.
   *
   * Optional so callers that genuinely have no history — tests, and the
   * brands screen's summary count — need not fetch it. Absent history means
   * "nothing sent yet", which for a queue preview errs towards showing the
   * first stage rather than towards silence.
   */
  sentByInvoice?: Map<string, SentReminder[]>,
  today: Date = new Date()
): FollowupQueueEntry[] {
  const entries: FollowupQueueEntry[] = [];

  for (const invoice of invoices) {
    if (!isUnpaid(invoice)) continue;

    const brand = brands.find((b) => b.id === invoice.brandId);
    if (!brand) continue;

    const next = nextScheduledReminder(
      invoice,
      reminderSchedule(brand.followup),
      sentByInvoice?.get(invoice.id) ?? [],
      today
    );
    if (!next) continue;

    entries.push({
      invoice,
      brand,
      scheduled: new Date(`${next.scheduledFor}T00:00`),
      reminderNumber: stagePosition(next.stage),
      stage: next.stage,
    });
  }

  return entries.sort((a, b) => a.scheduled.getTime() - b.scheduled.getTime());
}
