import { Invoice, InvoiceStatus, Currency } from "./types";
import { effectiveStatus } from "./dashboard";

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
