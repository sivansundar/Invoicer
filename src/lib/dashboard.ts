import type { Invoice, InvoiceStatus } from "./types";
import { monthlyPaidSeries } from "./chart";

export interface RevenueTrend {
  /** Percentage change vs last month, rounded. Never Infinity/NaN — see below. */
  pct: number;
  direction: "up" | "down";
}

/**
 * This-month-vs-last-month trend for the "Total revenue" card, derived from
 * `monthlyPaidSeries(invoices, 2, today)`.
 *
 * A percentage change against a zero last-month baseline is undefined (division
 * by zero), so when last month's paid total is zero we render a flat 0% rather
 * than Infinity/NaN. Because 0 is never less than 0, that also always resolves
 * to the "up" direction — which is correct in spirit: revenue can only stay flat
 * or grow from a zero base, it can never have *decreased* from nothing.
 */
export function revenueTrend(invoices: Invoice[], today: Date = new Date()): RevenueTrend {
  const [last, current] = monthlyPaidSeries(invoices, 2, today);
  const lastTotal = last.total;
  const thisTotal = current.total;

  const pct = lastTotal === 0 ? 0 : Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
  return { pct, direction: pct >= 0 ? "up" : "down" };
}

export interface RevenueCardCopy {
  /** False when there is no paid revenue at all — a trend pill would be a claim
   *  about a comparison that never happened, so the card suppresses it instead. */
  showTrend: boolean;
  footer: string;
}

/**
 * Decides whether the "Total revenue" card's trend badge/footer is safe to show.
 * With zero paid invoices, `revenueTrend` still returns a well-defined `{ pct: 0,
 * direction: "up" }` (see above) purely so it never throws or divides by zero —
 * but "Trending up this month" next to a value of "None" would assert something
 * that isn't true. `hasPaidRevenue` (whether the paid-invoice currency group is
 * non-empty) is the caller's signal to distinguish "flat because nothing changed"
 * from "flat because there was never anything to compare".
 */
export function revenueCardCopy(trend: RevenueTrend, hasPaidRevenue: boolean): RevenueCardCopy {
  if (!hasPaidRevenue) {
    return { showTrend: false, footer: "Nothing collected yet" };
  }
  return {
    showTrend: true,
    footer: trend.direction === "up" ? "Trending up this month" : "Down from last month",
  };
}

export interface CollectionRate {
  /** Percentage of issued invoices that have been paid, rounded. Never NaN. */
  rate: number;
  paid: number;
  issued: number;
}

/**
 * Paid ÷ issued, where "issued" excludes drafts (a draft was never sent, so it
 * can't count against collection). Guarded against a zero denominator — a
 * brand-new workspace with only drafts (or no invoices at all) renders 0%,
 * not NaN%.
 */
export function collectionRate(invoices: Invoice[]): CollectionRate {
  const issued = invoices.filter((invoice) => invoice.status !== "draft").length;
  const paid = invoices.filter((invoice) => invoice.status === "paid").length;
  const rate = issued === 0 ? 0 : Math.round((paid / issued) * 100);
  return { rate, paid, issued };
}

/**
 * Footer copy for the "Collection rate" card. `issued === 0` (a brand-new
 * workspace, or a brand filtered down to only drafts) gets its own copy rather
 * than falling through to "Chase the stragglers" — there is nothing to chase
 * when nothing has been sent yet.
 */
export function collectionRateFooter({ rate, issued }: CollectionRate): string {
  if (issued === 0) return "Nothing issued yet";
  return rate >= 80 ? "Healthy cash flow" : "Chase the stragglers";
}

/**
 * Days between an overdue invoice's due date and `today`, floored at 0.
 * Mirrors the `days_late` calculation in `followups.ts` (`templateContext`) so
 * the two surfaces never disagree about how "late" is counted.
 *
 * An empty or unparseable `dueDate` (unvalidated stored/imported data) builds
 * an Invalid Date, whose `getTime()` is `NaN` — that would otherwise
 * propagate into `Math.round(NaN)` === `NaN` and render as e.g. "NaN days
 * overdue" wherever this feeds display copy. Treated as "not late" (0) rather
 * than a number, since there's no valid due date to be late against.
 */
export function daysLate(invoice: Invoice, today: Date = new Date()): number {
  const midnight = new Date(today.toDateString());
  const due = new Date(`${invoice.dueDate}T00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(Math.round((midnight.getTime() - due.getTime()) / 864e5), 0);
}

/** The largest `daysLate` among a set of (presumably overdue) invoices, or 0 for none. */
export function oldestDaysLate(invoices: Invoice[], today: Date = new Date()): number {
  return invoices.reduce((max, invoice) => Math.max(max, daysLate(invoice, today)), 0);
}

/**
 * The status actually shown to the user — derived on every read rather than
 * ever written back to storage. The only status writes this app makes are
 * "draft", "sent" and "paid" (see `invoice-form.tsx`/`invoices/[id]/page.tsx`);
 * nothing ever stores "overdue", which used to make it permanently
 * unreachable everywhere the app checked `invoice.status === "overdue"` —
 * the dashboard's Overdue card, the Overdue tab, the detail page's due line,
 * the template preview sample and the FY summary report filter all silently
 * disagreed with `followups.ts`'s `isUnpaid`, which correctly keeps queuing
 * reminders for a late "sent" invoice regardless of that dead branch.
 *
 * Deliberately a derived read, not a stored write + migration: a write would
 * need a boot-time mutation pass plus a write-result check, and reintroduces
 * exactly the unvalidated-status-transition class of bug closed elsewhere on
 * this branch. A "paid" or "draft" invoice is never reclassified — only a
 * "sent" invoice whose due date has passed (`daysLate`, which already
 * treats an empty/unparseable `dueDate` as "not late" — see its own doc)
 * reads as "overdue" here. A record whose stored status is literally
 * "overdue" already (e.g. imported from a pre-branch export or hand-edited
 * data) passes through unchanged.
 */
export function effectiveStatus(invoice: Invoice, today: Date = new Date()): InvoiceStatus {
  if (invoice.status === "sent" && daysLate(invoice, today) > 0) return "overdue";
  return invoice.status;
}

/**
 * Mean days from bill date to payment, over invoices that actually record
 * both. Returns `null` when nothing qualifies — the caller shows "—" rather
 * than a fabricated zero.
 *
 * `paidOn` is deliberately optional and never backfilled (see its doc on
 * `Invoice`): an invoice paid before that field existed has no known payment
 * date, and guessing one would put a made-up number into a headline metric.
 * Those invoices are excluded from the mean rather than counted as same-day.
 *
 * An unparseable `billDate` or `paidOn` is skipped for the same reason
 * `daysLate` treats a bad `dueDate` as "not late": stored dates are
 * unvalidated, and `NaN` would otherwise poison the whole average.
 */
export function avgDaysToPay(invoices: Invoice[]): number | null {
  let total = 0;
  let counted = 0;

  for (const invoice of invoices) {
    if (invoice.status !== "paid" || !invoice.paidOn) continue;
    const billed = new Date(`${invoice.billDate}T00:00`);
    const paid = new Date(`${invoice.paidOn}T00:00`);
    if (Number.isNaN(billed.getTime()) || Number.isNaN(paid.getTime())) continue;
    // A payment recorded before the bill date is corrupt rather than
    // instantaneous; clamping to 0 keeps one bad record from dragging the
    // mean negative.
    total += Math.max(Math.round((paid.getTime() - billed.getTime()) / 864e5), 0);
    counted += 1;
  }

  return counted === 0 ? null : Math.round(total / counted);
}

/** Days since the oldest draft was created, or `null` when there are no drafts. */
export function oldestDraftAgeDays(
  invoices: Invoice[],
  today: Date = new Date()
): number | null {
  const midnight = new Date(today.toDateString());
  let oldest: number | null = null;

  for (const invoice of invoices) {
    if (invoice.status !== "draft") continue;
    const created = new Date(invoice.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const age = Math.max(
      Math.round((midnight.getTime() - new Date(created.toDateString()).getTime()) / 864e5),
      0
    );
    if (oldest === null || age > oldest) oldest = age;
  }

  return oldest;
}
