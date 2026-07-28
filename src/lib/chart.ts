import type { Currency, Invoice } from "./types";

/**
 * Approximate rates used ONLY to plot mixed-currency revenue on one axis.
 * They are a display convenience, never used for stored totals or documents.
 */
export const APPROX_INR_RATES: Record<Currency, number> = {
  INR: 1,
  USD: 83,
  SGD: 62,
};

export interface MonthPoint {
  key: string;
  label: string;
  total: number;
}

/**
 * Sums invoices with status "paid" by their bill month. Note: the series reflects
 * when work was *billed* (billDate), not when payment was *received*, because the
 * Invoice model does not record a payment date.
 */
export function monthlyPaidSeries(
  invoices: Invoice[],
  monthCount: number,
  today: Date = new Date()
): MonthPoint[] {
  const months: MonthPoint[] = [];
  for (let back = monthCount - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en", { month: "short" }),
      total: 0,
    });
  }

  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const invoice of invoices) {
    if (invoice.status !== "paid") continue;
    const point = byKey.get(invoice.billDate.slice(0, 7));
    if (!point) continue;
    point.total += invoice.total * APPROX_INR_RATES[invoice.currency ?? "INR"];
  }

  return months;
}
