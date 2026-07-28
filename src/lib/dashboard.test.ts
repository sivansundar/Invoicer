import { describe, expect, it } from "vitest";
import {
  collectionRate,
  collectionRateFooter,
  daysLate,
  oldestDaysLate,
  revenueCardCopy,
  revenueTrend,
} from "./dashboard";
import type { Invoice } from "./types";

const today = new Date(2026, 6, 28); // 28 July 2026

function inv(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "1",
    invoiceNumber: "INV-1",
    brandId: "b1",
    currency: "INR",
    status: "paid",
    billDate: "2026-07-10",
    dueDate: "2026-07-10",
    client: { companyName: "Acme", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 0,
    createdAt: "",
    updatedAt: "",
    brandSnapshot: {} as Invoice["brandSnapshot"],
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("revenueTrend", () => {
  it("computes a positive percentage when this month beats last month", () => {
    const invoices = [
      inv({ billDate: "2026-06-10", total: 10000 }),
      inv({ billDate: "2026-07-10", total: 15000 }),
    ];
    expect(revenueTrend(invoices, today)).toEqual({ pct: 50, direction: "up" });
  });

  it("computes a negative percentage when this month trails last month", () => {
    const invoices = [
      inv({ billDate: "2026-06-10", total: 20000 }),
      inv({ billDate: "2026-07-10", total: 5000 }),
    ];
    expect(revenueTrend(invoices, today)).toEqual({ pct: -75, direction: "down" });
  });

  it("renders a flat 0% (not Infinity/NaN) when last month is zero and this month is zero too", () => {
    expect(revenueTrend([], today)).toEqual({ pct: 0, direction: "up" });
  });

  it("renders a flat 0% (not Infinity) when last month is zero but this month has revenue", () => {
    const invoices = [inv({ billDate: "2026-07-10", total: 40000 })];
    expect(revenueTrend(invoices, today)).toEqual({ pct: 0, direction: "up" });
  });

  it("never returns NaN or Infinity for any zero-baseline case", () => {
    const { pct } = revenueTrend([], today);
    expect(Number.isFinite(pct)).toBe(true);
  });
});

describe("revenueCardCopy", () => {
  it("shows the trend and 'Trending up this month' when there is paid revenue and the trend is up", () => {
    const trend = { pct: 50, direction: "up" as const };
    expect(revenueCardCopy(trend, true)).toEqual({
      showTrend: true,
      footer: "Trending up this month",
    });
  });

  it("shows the trend and 'Down from last month' when there is paid revenue and the trend is down", () => {
    const trend = { pct: -75, direction: "down" as const };
    expect(revenueCardCopy(trend, true)).toEqual({
      showTrend: true,
      footer: "Down from last month",
    });
  });

  it("suppresses the trend badge and does not claim 'Trending up' when there is no paid revenue", () => {
    // This is the end-to-end regression for the false claim: revenueTrend([], today)
    // returns { pct: 0, direction: "up" } purely to stay finite, but with zero paid
    // invoices, showTrend must be false and the footer must not say "Trending up".
    const trend = revenueTrend([], today);
    const copy = revenueCardCopy(trend, false);
    expect(copy.showTrend).toBe(false);
    expect(copy.footer).toBe("Nothing collected yet");
    expect(copy.footer).not.toMatch(/trending up/i);
  });

  it("suppresses the trend badge even if a stray positive pct were ever computed with no revenue", () => {
    // Defensive: hasPaidRevenue is the sole authority on whether to show a trend,
    // regardless of what the trend object itself says.
    const copy = revenueCardCopy({ pct: 999, direction: "up" }, false);
    expect(copy.showTrend).toBe(false);
    expect(copy.footer).toBe("Nothing collected yet");
  });
});

describe("collectionRate", () => {
  it("divides paid by issued, excluding drafts from the denominator", () => {
    const invoices = [
      inv({ status: "draft" }),
      inv({ status: "sent" }),
      inv({ status: "paid" }),
      inv({ status: "paid" }),
    ];
    // issued = sent + paid + paid = 3, paid = 2 -> 67%
    expect(collectionRate(invoices)).toEqual({ rate: 67, paid: 2, issued: 3 });
  });

  it("renders 0%, not NaN%, when there are no issued invoices", () => {
    expect(collectionRate([])).toEqual({ rate: 0, paid: 0, issued: 0 });
  });

  it("renders 0%, not NaN%, when only drafts exist", () => {
    expect(collectionRate([inv({ status: "draft" }), inv({ status: "draft" })])).toEqual({
      rate: 0,
      paid: 0,
      issued: 0,
    });
  });

  it("renders 100% when every issued invoice is paid", () => {
    expect(collectionRate([inv({ status: "paid" }), inv({ status: "paid" })])).toEqual({
      rate: 100,
      paid: 2,
      issued: 2,
    });
  });
});

describe("collectionRateFooter", () => {
  it("reads 'Healthy cash flow' at or above 80%", () => {
    expect(collectionRateFooter({ rate: 80, paid: 4, issued: 5 })).toBe("Healthy cash flow");
    expect(collectionRateFooter({ rate: 100, paid: 2, issued: 2 })).toBe("Healthy cash flow");
  });

  it("reads 'Chase the stragglers' below 80% when something has actually been issued", () => {
    expect(collectionRateFooter({ rate: 50, paid: 1, issued: 2 })).toBe("Chase the stragglers");
    expect(collectionRateFooter({ rate: 0, paid: 0, issued: 3 })).toBe("Chase the stragglers");
  });

  it("does not tell a brand-new user to chase anyone when nothing has been issued", () => {
    // End-to-end regression: collectionRate([]) legitimately returns rate: 0, which
    // would otherwise fall into the "below 80%" branch and render "Chase the
    // stragglers" for a workspace that has never issued an invoice.
    const collection = collectionRate([]);
    const footer = collectionRateFooter(collection);
    expect(footer).toBe("Nothing issued yet");
    expect(footer).not.toMatch(/chase/i);
  });

  it("also applies when only drafts exist (issued excludes drafts, so issued is still 0)", () => {
    const collection = collectionRate([inv({ status: "draft" }), inv({ status: "draft" })]);
    expect(collectionRateFooter(collection)).toBe("Nothing issued yet");
  });
});

describe("daysLate", () => {
  it("is 0 for an invoice due today", () => {
    expect(daysLate(inv({ dueDate: "2026-07-28" }), today)).toBe(0);
  });

  it("counts whole days past the due date", () => {
    expect(daysLate(inv({ dueDate: "2026-07-18" }), today)).toBe(10);
  });

  it("floors at 0 for a due date in the future", () => {
    expect(daysLate(inv({ dueDate: "2026-08-10" }), today)).toBe(0);
  });
});

describe("oldestDaysLate", () => {
  it("returns the largest daysLate across invoices", () => {
    const invoices = [
      inv({ dueDate: "2026-07-25" }),
      inv({ dueDate: "2026-07-01" }),
      inv({ dueDate: "2026-07-20" }),
    ];
    expect(oldestDaysLate(invoices, today)).toBe(27);
  });

  it("is 0 for an empty list", () => {
    expect(oldestDaysLate([], today)).toBe(0);
  });
});
