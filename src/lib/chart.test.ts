import { describe, expect, it } from "vitest";
import { monthlyPaidSeries } from "./chart";
import type { Invoice } from "./types";

function inv(
  billDate: string,
  total: number,
  status = "paid",
  currency = "INR",
  paidOn?: string
): Invoice {
  return { billDate, total, status, currency, paidOn } as Invoice;
}

const today = new Date(2026, 6, 28); // 28 July 2026

describe("monthlyPaidSeries", () => {
  it("returns one point per requested month, oldest first", () => {
    const series = monthlyPaidSeries([], 3, today);
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("labels months with a short month name", () => {
    const series = monthlyPaidSeries([], 3, today);
    expect(series[2].label).toBe("Jul");
  });

  it("falls back to the bill month when paidOn is unset (historical invoices)", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 40000)], 3, today);
    expect(series[2].total).toBe(40000);
  });

  it("buckets by paidOn instead of billDate when paidOn is set", () => {
    const series = monthlyPaidSeries(
      [inv("2026-06-15", 40000, "paid", "INR", "2026-07-02")],
      3,
      today
    );
    expect(series[1].total).toBe(0); // June bucket — billDate, not used
    expect(series[2].total).toBe(40000); // July bucket — paidOn
  });

  it("moves revenue across a financial-year boundary via paidOn", () => {
    // Billed 31 March, marked paid (and noticed) 2 April, but the money
    // actually landed 31 March — paidOn keeps it in the March bucket.
    const marchToday = new Date(2026, 3, 15); // 15 April 2026
    const series = monthlyPaidSeries(
      [inv("2026-04-02", 1000, "paid", "INR", "2026-03-31")],
      2,
      marchToday
    );
    expect(series[0].key).toBe("2026-03");
    expect(series[0].total).toBe(1000);
    expect(series[1].total).toBe(0);
  });

  it("ignores invoices that are not paid", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 40000, "sent")], 3, today);
    expect(series[2].total).toBe(0);
  });

  it("ignores months outside the window", () => {
    const series = monthlyPaidSeries([inv("2026-01-10", 999)], 3, today);
    expect(series.every((p) => p.total === 0)).toBe(true);
  });

  it("converts foreign currencies to approximate rupees", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 100, "paid", "USD")], 1, today);
    expect(series[0].total).toBe(8300);
  });

  it("spans a year boundary correctly", () => {
    const series = monthlyPaidSeries([], 3, new Date(2026, 1, 15));
    expect(series.map((p) => p.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});
