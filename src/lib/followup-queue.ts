import type { Brand, Invoice } from "./types";
import { nextSendDate } from "./followups";

export interface FollowupQueueEntry {
  invoice: Invoice;
  brand: Brand;
  /** The next scheduled slot for this invoice's next reminder. */
  scheduled: Date;
  /** 1-indexed — the reminder this slot would be, counting ones already sent. */
  reminderNumber: number;
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
  today: Date = new Date()
): FollowupQueueEntry[] {
  const entries: FollowupQueueEntry[] = [];

  for (const invoice of invoices) {
    if (invoice.status !== "sent" && invoice.status !== "overdue") continue;

    const brand = brands.find((b) => b.id === invoice.brandId);
    if (!brand) continue;

    const scheduled = nextSendDate(invoice, brand.followup, today);
    if (!scheduled) continue;

    entries.push({
      invoice,
      brand,
      scheduled,
      reminderNumber: (invoice.reminders?.length ?? 0) + 1,
    });
  }

  return entries.sort((a, b) => a.scheduled.getTime() - b.scheduled.getTime());
}
