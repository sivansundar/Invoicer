import { describe, expect, it } from "vitest";
import { formatCurrencyGroups, groupTotalsByCurrency, overflowSummary } from "./money";
import type { Invoice } from "./types";

function inv(currency: Invoice["currency"], total: number): Invoice {
  return { currency, total } as Invoice;
}

describe("groupTotalsByCurrency", () => {
  it("sums per currency", () => {
    const result = groupTotalsByCurrency([inv("INR", 1000), inv("INR", 500)]);
    expect(result).toEqual([{ currency: "INR", total: 1500 }]);
  });

  it("orders INR, USD, SGD regardless of input order", () => {
    const result = groupTotalsByCurrency([inv("SGD", 10), inv("USD", 20), inv("INR", 30)]);
    expect(result.map((g) => g.currency)).toEqual(["INR", "USD", "SGD"]);
  });

  it("omits currencies with no invoices", () => {
    expect(groupTotalsByCurrency([inv("USD", 5)]).map((g) => g.currency)).toEqual(["USD"]);
  });

  it("defaults a missing currency to INR", () => {
    const result = groupTotalsByCurrency([{ total: 100 } as Invoice]);
    expect(result).toEqual([{ currency: "INR", total: 100 }]);
  });

  it("returns an empty array for no invoices", () => {
    expect(groupTotalsByCurrency([])).toEqual([]);
  });
});

describe("formatCurrencyGroups", () => {
  it("joins multiple currencies with a plus", () => {
    const out = formatCurrencyGroups([
      { currency: "INR", total: 49560 },
      { currency: "USD", total: 1200 },
    ]);
    expect(out).toBe("₹49,560 + $1,200.00");
  });

  it("renders a zero-rupee string when there is nothing", () => {
    expect(formatCurrencyGroups([])).toBe("₹0");
  });
});

describe("overflowSummary", () => {
  it("is empty for a single currency", () => {
    expect(overflowSummary([{ currency: "INR", total: 10 }])).toBe("");
  });

  it("lists every currency after the first", () => {
    const out = overflowSummary([
      { currency: "INR", total: 10 },
      { currency: "USD", total: 20 },
    ]);
    expect(out).toBe("Includes $20.00");
    expect(out).not.toContain("₹10");
  });
});
