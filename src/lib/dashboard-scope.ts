import type { Brand, Invoice } from "./types";
import { effectiveStatus } from "./dashboard";
import { availableFinancialYears, filterInvoices, type FinancialYear } from "./reports";

/**
 * What the dashboard's scope row is allowed to offer, and how a selection
 * resolves against data that has since changed. All of it derived: the years
 * come from bill dates, the brands from brand records, and nothing here
 * invents an option that no record stands behind.
 *
 * The financial-year maths is `@/lib/reports`'s — `availableFinancialYears`
 * and `filterInvoices` — not a second copy. Two implementations of "which
 * invoices are in FY 2026-27" is exactly how the dashboard and the reports
 * screen would come to disagree about the same year.
 */

/** A year selection. `"all"` is the widening escape, never the default. */
export type YearScope = number | "all";

export interface BrandOption {
  id: string;
  name: string;
}

/**
 * How the brand control should render, or that it should not render at all.
 * A segmented control is only legible while the segments fit on one row, so
 * past `SEGMENT_LIMIT` brands it becomes a select rather than wrapping the
 * row or scrolling sideways.
 */
export type BrandControl = "none" | "segmented" | "select";

const SEGMENT_LIMIT = 4;

export interface ScopeControls {
  /** Financial years with invoices behind them, most recent first. */
  years: FinancialYear[];
  /**
   * False when every invoice sits in the same financial year: there is one
   * option, choosing it changes nothing, so the row states the year instead
   * of offering a pick.
   */
  yearIsChoice: boolean;
  brands: BrandOption[];
  brandControl: BrandControl;
}

export function dashboardScopeControls(
  invoices: Invoice[],
  brands: Brand[]
): ScopeControls {
  const years = availableFinancialYears(invoices);
  const options = brands.map((brand) => ({ id: brand.id, name: brand.name }));

  // One brand makes "All brands" and that brand the same set — two segments
  // that always agree is a control in name only.
  const brandControl: BrandControl =
    options.length < 2 ? "none" : options.length > SEGMENT_LIMIT ? "select" : "segmented";

  return { years, yearIsChoice: years.length > 1, brands: options, brandControl };
}

/**
 * The financial year actually in force. `null` means no year narrowing —
 * either the reader asked for all years, or there are no invoices to place
 * in one.
 *
 * A picked year that has vanished (an import replaced the book, the last
 * invoice of a year was deleted) falls back to the default rather than
 * leaving the dashboard scoped to a year nothing is in. Same reconciliation
 * the reports screen does for its currency and year picks.
 */
export function resolveYearScope(
  picked: YearScope | null,
  controls: ScopeControls
): number | null {
  const fallback = controls.years[0]?.startYear ?? null;
  if (picked === null) return fallback;
  // With a single year on the books, "all years" and that year select the
  // same invoices; resolving to the year keeps the row naming what is on
  // screen instead of claiming a breadth that does not exist.
  if (picked === "all") return controls.yearIsChoice ? null : fallback;
  return controls.years.some((year) => year.startYear === picked) ? picked : fallback;
}

/**
 * The brand actually in force. A brand deleted since it was selected reads
 * as "all brands" — `deleteBrand` never cascades to its invoices, so the
 * alternative is a dashboard scoped to a brand that no longer exists.
 */
export function resolveBrandScope(
  picked: string | null,
  controls: ScopeControls
): string | null {
  if (!picked) return null;
  return controls.brands.some((brand) => brand.id === picked) ? picked : null;
}

/**
 * The invoices a financial year holds, April through March. `null` returns
 * the book untouched — including invoices whose bill date cannot be parsed,
 * which `filterInvoices` drops because there is no year to place them in.
 */
export function invoicesInFinancialYear(
  invoices: Invoice[],
  startYear: number | null,
  today: Date = new Date()
): Invoice[] {
  if (startYear === null) return invoices;
  return filterInvoices(
    invoices,
    {
      startYear,
      fromMonth: 3,
      toMonth: 2,
      statuses: ["draft", "sent", "paid", "overdue"],
      brandId: null,
    },
    today
  );
}

/** The financial year an invoice falls in, or null when its bill date is unusable. */
function invoiceFinancialYear(invoice: Invoice): number | null {
  return availableFinancialYears([invoice])[0]?.startYear ?? null;
}

/**
 * Overdue invoices the year scope is hiding — the one thing a scope row must
 * not silently swallow. An invoice six months late is still money owed when
 * the dashboard is showing this year, and the row says so rather than
 * letting the count in "Needs you" quietly read zero.
 *
 * Zero when no year is in force, and invoices with an unusable bill date are
 * left out: no year selection would reveal them, so offering to widen the
 * scope for their sake would be a button that changes nothing.
 */
export function hiddenOverdueCount(
  invoices: Invoice[],
  scope: { startYear: number | null; brandId: string | null },
  today: Date = new Date()
): number {
  if (scope.startYear === null) return 0;

  return invoices.filter((invoice) => {
    if (scope.brandId && invoice.brandId !== scope.brandId) return false;
    if (effectiveStatus(invoice, today) !== "overdue") return false;
    const year = invoiceFinancialYear(invoice);
    return year !== null && year !== scope.startYear;
  }).length;
}
