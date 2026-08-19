import { Invoice, InvoiceStatus, Currency } from "./types";
import { effectiveStatus } from "./dashboard";
import { getCurrencySymbol } from "./utils";

// Financial year runs April → March (Indian FY). A financial year is identified
// by its starting calendar year: FY 2025-26 has startYear 2025 and spans
// April 2025 through March 2026.

// Months in financial-year order. `month` is a JS month index (0 = January).
export const FY_MONTHS: readonly { month: number; label: string }[] = [
  { month: 3, label: "April" },
  { month: 4, label: "May" },
  { month: 5, label: "June" },
  { month: 6, label: "July" },
  { month: 7, label: "August" },
  { month: 8, label: "September" },
  { month: 9, label: "October" },
  { month: 10, label: "November" },
  { month: 11, label: "December" },
  { month: 0, label: "January" },
  { month: 1, label: "February" },
  { month: 2, label: "March" },
] as const;

export interface FinancialYear {
  startYear: number;
  label: string;
}

/** Parse a "yyyy-MM-dd" bill date into calendar year/month (0-indexed). */
function parseBillYearMonth(billDate: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(billDate);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

/** The start year of the financial year a given calendar year/month falls in. */
function fyStartYear(year: number, month: number): number {
  return month >= 3 ? year : year - 1;
}

export function fyLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `FY ${startYear}-${end.toString().padStart(2, "0")}`;
}

/** The calendar year a given FY month resolves to for a financial year. */
export function calendarYearForFyMonth(startYear: number, month: number): number {
  return month >= 3 ? startYear : startYear + 1;
}

/** Position of a month within the FY ordering (0 = April … 11 = March). */
export function fyOrderIndex(month: number): number {
  return FY_MONTHS.findIndex((m) => m.month === month);
}

/** Distinct financial years present in the invoices, most recent first. */
export function availableFinancialYears(invoices: Invoice[]): FinancialYear[] {
  const years = new Set<number>();
  for (const inv of invoices) {
    const parsed = parseBillYearMonth(inv.billDate);
    if (parsed) years.add(fyStartYear(parsed.year, parsed.month));
  }
  return [...years]
    .sort((a, b) => b - a)
    .map((startYear) => ({ startYear, label: fyLabel(startYear) }));
}

export interface ReportFilters {
  startYear: number;
  fromMonth: number; // JS month index
  toMonth: number; // JS month index
  statuses: InvoiceStatus[];
  brandId: string | null; // null = all brands
}

/** Comparable month key so month-range checks are timezone-independent. */
function monthKey(year: number, month: number): number {
  return year * 12 + month;
}

export function filterInvoices(
  invoices: Invoice[],
  filters: ReportFilters,
  today: Date = new Date()
): Invoice[] {
  const fromKey = monthKey(
    calendarYearForFyMonth(filters.startYear, filters.fromMonth),
    filters.fromMonth
  );
  const toKey = monthKey(
    calendarYearForFyMonth(filters.startYear, filters.toMonth),
    filters.toMonth
  );
  const statusSet = new Set(filters.statuses);

  return invoices
    .filter((inv) => {
      const parsed = parseBillYearMonth(inv.billDate);
      if (!parsed) return false;
      const key = monthKey(parsed.year, parsed.month);
      if (key < fromKey || key > toKey) return false;
      // effectiveStatus, not the raw stored status — nothing this app writes
      // ever stores "overdue" literally (see dashboard.ts's doc), so
      // checking the Overdue box here previously matched nothing, ever.
      if (!statusSet.has(effectiveStatus(inv, today))) return false;
      if (filters.brandId && inv.brandId !== filters.brandId) return false;
      return true;
    })
    .sort((a, b) => a.billDate.localeCompare(b.billDate));
}

export interface CurrencyTotal {
  currency: Currency;
  total: number;
  count: number;
}

export interface ReportSummary {
  count: number;
  totalsByCurrency: CurrencyTotal[];
  statusCounts: Partial<Record<InvoiceStatus, number>>;
}

const CURRENCY_ORDER: Currency[] = ["INR", "USD", "SGD"];

export function summarize(invoices: Invoice[]): ReportSummary {
  const byCurrency = new Map<Currency, { total: number; count: number }>();
  const statusCounts: Partial<Record<InvoiceStatus, number>> = {};

  for (const inv of invoices) {
    const cur = inv.currency ?? "INR";
    const entry = byCurrency.get(cur) ?? { total: 0, count: 0 };
    entry.total += inv.total;
    entry.count += 1;
    byCurrency.set(cur, entry);
    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
  }

  const totalsByCurrency = [...byCurrency.entries()]
    .map(([currency, v]) => ({ currency, total: v.total, count: v.count }))
    .sort((a, b) => CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency));

  return { count: invoices.length, totalsByCurrency, statusCounts };
}

/** Invoices grouped by currency in display order, each group internally date-sorted. */
export function groupByCurrency(invoices: Invoice[]): { currency: Currency; invoices: Invoice[] }[] {
  const groups = new Map<Currency, Invoice[]>();
  for (const inv of invoices) {
    const cur = inv.currency ?? "INR";
    const list = groups.get(cur) ?? [];
    list.push(inv);
    groups.set(cur, list);
  }
  return [...groups.entries()]
    .map(([currency, list]) => ({ currency, invoices: list }))
    .sort((a, b) => CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency));
}

/**
 * Which currency a book is mostly kept in: the one with the most invoices.
 * Ties fall to `CURRENCY_ORDER` because `groupByCurrency` already sorts that
 * way and `reduce` keeps the incumbent on an equal count. Returns null for an
 * empty book — there is no currency to default a single-currency view to.
 */
export function dominantCurrency(invoices: Invoice[]): Currency | null {
  const groups = groupByCurrency(invoices);
  if (groups.length === 0) return null;
  return groups.reduce((best, group) =>
    group.invoices.length > best.invoices.length ? group : best
  ).currency;
}

export interface MonthlyCurrencyRow {
  /** JS month index (0 = January). */
  month: number;
  /** Full month name, e.g. "April". */
  label: string;
  /** Three-letter name for a chart axis, e.g. "Apr". */
  shortLabel: string;
  /** The calendar year this FY month lands in. */
  calendarYear: number;
  issued: number;
  collected: number;
  outstanding: number;
  /** Invoices behind `issued`. 0 means the month is empty, not worth zero. */
  count: number;
  /** `collected / issued` as a percentage, or null when nothing was issued. */
  collectionPct: number | null;
}

const ALL_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];

/**
 * One financial year of a SINGLE currency, month by month, April first.
 *
 * Single currency on purpose: this app bills in INR, USD and SGD, and a
 * column that adds ₹, $ and S$ together is a number that does not exist.
 * The caller picks one currency (see `dominantCurrency`) and says so in the
 * UI; everything here is denominated in that currency alone.
 *
 * Bucketed by **bill date**, not by the date payment arrived. That is the
 * cohort reading — "of what I billed in April, how much has landed" — and it
 * is what makes the three money columns reconcile
 * (`issued = collected + outstanding`) and the per-month collection rate
 * bounded at 100%. A cash-basis bucket (`paidOn`, as `monthlyPaidSeries`
 * uses on the dashboard) would let a month collect money it never issued and
 * turn that rate into a meaningless ratio of two unrelated cohorts.
 *
 * Drafts are excluded: nothing was issued and nobody owes anything yet.
 * Status is `effectiveStatus`, so an unpaid invoice past its due date counts
 * as outstanding whatever the stored value says. Every one of the twelve
 * months is returned, empty ones included — an absent month reads as a gap
 * in the data rather than as a month where nothing was billed.
 */
export function monthlyTotalsForCurrency(
  invoices: Invoice[],
  currency: Currency,
  startYear: number,
  today: Date = new Date()
): MonthlyCurrencyRow[] {
  // Reuses the financial-year window `filterInvoices` already implements
  // (April → March, with Jan–Mar resolving to the next calendar year).
  const inYear = filterInvoices(
    invoices,
    { startYear, fromMonth: 3, toMonth: 2, statuses: ALL_STATUSES, brandId: null },
    today
  );

  const rows: MonthlyCurrencyRow[] = FY_MONTHS.map(({ month, label }) => ({
    month,
    label,
    shortLabel: label.slice(0, 3),
    calendarYear: calendarYearForFyMonth(startYear, month),
    issued: 0,
    collected: 0,
    outstanding: 0,
    count: 0,
    collectionPct: null,
  }));
  const byMonth = new Map(rows.map((row) => [row.month, row]));

  for (const inv of inYear) {
    if ((inv.currency ?? "INR") !== currency) continue;
    const status = effectiveStatus(inv, today);
    if (status === "draft") continue;
    const parsed = parseBillYearMonth(inv.billDate);
    if (!parsed) continue;
    const row = byMonth.get(parsed.month);
    if (!row) continue;
    row.issued += inv.total;
    row.count += 1;
    if (status === "paid") row.collected += inv.total;
    else row.outstanding += inv.total;
  }

  for (const row of rows) {
    row.collectionPct =
      row.issued === 0 ? null : Math.round((row.collected / row.issued) * 100);
  }

  return rows;
}

/**
 * Mean collected across the months that actually had invoices. Averaging over
 * all twelve would divide a part-finished financial year by months it has not
 * reached yet and quietly halve the line. Null when no month had any.
 */
export function collectedAverage(rows: MonthlyCurrencyRow[]): number | null {
  const active = rows.filter((row) => row.count > 0);
  if (active.length === 0) return null;
  return active.reduce((sum, row) => sum + row.collected, 0) / active.length;
}

/**
 * Short money for chart axes, where a full ₹12,50,000 on every tick is
 * unreadable. INR uses lakh/crore because that is how the number is spoken
 * where it is billed; USD and SGD use k/M.
 */
export function compactMoney(value: number, currency: Currency): string {
  const symbol = getCurrencySymbol(currency);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const scaled = (divisor: number, suffix: string) =>
    `${sign}${symbol}${(abs / divisor).toFixed(1)}${suffix}`;

  if (currency === "INR") {
    if (abs >= 1e7) return scaled(1e7, "Cr");
    if (abs >= 1e5) return scaled(1e5, "L");
  } else if (abs >= 1e6) {
    return scaled(1e6, "M");
  }
  if (abs >= 1e3) return `${sign}${symbol}${Math.round(abs / 1e3)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
}
