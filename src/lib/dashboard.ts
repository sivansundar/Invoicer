import type { Invoice } from "./types";
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
