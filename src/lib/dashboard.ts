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
 * Days between an overdue invoice's due date and `today`, floored at 0.
 * Mirrors the `days_late` calculation in `followups.ts` (`templateContext`) so
 * the two surfaces never disagree about how "late" is counted.
 */
export function daysLate(invoice: Invoice, today: Date = new Date()): number {
  const midnight = new Date(today.toDateString());
  return Math.max(
    Math.round((midnight.getTime() - new Date(`${invoice.dueDate}T00:00`).getTime()) / 864e5),
    0
  );
}

/** The largest `daysLate` among a set of (presumably overdue) invoices, or 0 for none. */
export function oldestDaysLate(invoices: Invoice[], today: Date = new Date()): number {
  return invoices.reduce((max, invoice) => Math.max(max, daysLate(invoice, today)), 0);
}
