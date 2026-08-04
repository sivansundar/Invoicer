import { describe, expect, it } from "vitest";
import {
  availableFinancialYears,
  filterInvoices,
  fyLabel,
  fyOrderIndex,
  groupByCurrency,
  summarize,
  calendarYearForFyMonth,
} from "./reports";
import { Invoice, InvoiceStatus, Currency } from "./types";

function makeInvoice(
  billDate: string,
  overrides: Partial<Invoice> = {}
): Invoice {
  return {
    id: billDate + Math.random(),
    invoiceNumber: overrides.invoiceNumber ?? "INV001",
    brandId: overrides.brandId ?? "brand-a",
    currency: overrides.currency ?? "INR",
    status: overrides.status ?? "paid",
    billDate,
    dueDate: billDate,
    client: { companyName: "Acme", address: "" },
    items: [],
    subtotal: overrides.total ?? 100,
    totalTax: 0,
    total: overrides.total ?? 100,
    createdAt: "",
    updatedAt: "",
    brandSnapshot: {} as Invoice["brandSnapshot"],
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

const ALL_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];

describe("fyLabel", () => {
  it("formats the financial year label", () => {
    expect(fyLabel(2025)).toBe("FY 2025-26");
    expect(fyLabel(1999)).toBe("FY 1999-00");
    expect(fyLabel(2009)).toBe("FY 2009-10");
  });
});

describe("calendarYearForFyMonth", () => {
  it("maps Apr–Dec to the start year and Jan–Mar to the next year", () => {
    expect(calendarYearForFyMonth(2025, 3)).toBe(2025); // April
    expect(calendarYearForFyMonth(2025, 11)).toBe(2025); // December
    expect(calendarYearForFyMonth(2025, 0)).toBe(2026); // January
    expect(calendarYearForFyMonth(2025, 2)).toBe(2026); // March
  });
});

describe("fyOrderIndex", () => {
  it("orders months April-first", () => {
    expect(fyOrderIndex(3)).toBe(0); // April
    expect(fyOrderIndex(2)).toBe(11); // March
    expect(fyOrderIndex(0)).toBe(9); // January
  });
});

describe("availableFinancialYears", () => {
  it("derives distinct FYs from bill dates, most recent first", () => {
    const invoices = [
      makeInvoice("2025-04-01"), // FY 2025
      makeInvoice("2026-03-31"), // FY 2025 (March belongs to prior FY start)
      makeInvoice("2024-12-15"), // FY 2024
      makeInvoice("2025-01-10"), // FY 2024 (January belongs to prior FY start)
    ];
    const fys = availableFinancialYears(invoices);
    expect(fys.map((f) => f.startYear)).toEqual([2025, 2024]);
    expect(fys[0].label).toBe("FY 2025-26");
  });

  it("ignores malformed bill dates", () => {
    expect(availableFinancialYears([makeInvoice("not-a-date")])).toEqual([]);
  });
});

describe("filterInvoices", () => {
  const invoices = [
    makeInvoice("2025-03-31", { invoiceNumber: "PREV" }), // FY 2024, excluded
    makeInvoice("2025-04-01", { invoiceNumber: "APR" }),
    makeInvoice("2025-09-15", { invoiceNumber: "SEP" }),
    makeInvoice("2026-01-20", { invoiceNumber: "JAN" }),
    makeInvoice("2026-03-31", { invoiceNumber: "MAR" }),
    makeInvoice("2026-04-01", { invoiceNumber: "NEXT" }), // FY 2026, excluded
  ];

  it("includes only invoices within the FY month range", () => {
    const result = filterInvoices(invoices, {
      startYear: 2025,
      fromMonth: 3, // April
      toMonth: 2, // March (full FY)
      statuses: ALL_STATUSES,
      brandId: null,
    });
    expect(result.map((i) => i.invoiceNumber)).toEqual(["APR", "SEP", "JAN", "MAR"]);
  });

  it("respects a partial month range spanning the year boundary", () => {
    const result = filterInvoices(invoices, {
      startYear: 2025,
      fromMonth: 8, // September
      toMonth: 0, // January
      statuses: ALL_STATUSES,
      brandId: null,
    });
    expect(result.map((i) => i.invoiceNumber)).toEqual(["SEP", "JAN"]);
  });

  it("filters by status", () => {
    const withStatuses = [
      makeInvoice("2025-05-01", { invoiceNumber: "P", status: "paid" }),
      makeInvoice("2025-05-02", { invoiceNumber: "D", status: "draft" }),
    ];
    const result = filterInvoices(withStatuses, {
      startYear: 2025,
      fromMonth: 3,
      toMonth: 2,
      statuses: ["paid"],
      brandId: null,
    });
    expect(result.map((i) => i.invoiceNumber)).toEqual(["P"]);
  });

  it("matches the Overdue status filter against a sent invoice past its due date (effectiveStatus, not stored status)", () => {
    // Nothing this app writes ever stores status "overdue" literally — a
    // raw-status check here previously left the Overdue checkbox matching
    // nothing, ever, regardless of what was actually late.
    const today = new Date(2026, 6, 28);
    const withDueDates = [
      makeInvoice("2025-05-01", {
        invoiceNumber: "LATE",
        status: "sent",
        dueDate: "2025-05-10",
      }),
      makeInvoice("2025-05-02", {
        invoiceNumber: "NOT-YET-DUE",
        status: "sent",
        dueDate: "2026-12-01",
      }),
    ];
    const result = filterInvoices(
      withDueDates,
      { startYear: 2025, fromMonth: 3, toMonth: 2, statuses: ["overdue"], brandId: null },
      today
    );
    expect(result.map((i) => i.invoiceNumber)).toEqual(["LATE"]);
  });

  it("filters by brand when brandId is set", () => {
    const brands = [
      makeInvoice("2025-05-01", { invoiceNumber: "A", brandId: "brand-a" }),
      makeInvoice("2025-05-02", { invoiceNumber: "B", brandId: "brand-b" }),
    ];
    const result = filterInvoices(brands, {
      startYear: 2025,
      fromMonth: 3,
      toMonth: 2,
      statuses: ALL_STATUSES,
      brandId: "brand-b",
    });
    expect(result.map((i) => i.invoiceNumber)).toEqual(["B"]);
  });

  it("sorts results by bill date ascending", () => {
    const unordered = [
      makeInvoice("2025-12-01", { invoiceNumber: "DEC" }),
      makeInvoice("2025-06-01", { invoiceNumber: "JUN" }),
    ];
    const result = filterInvoices(unordered, {
      startYear: 2025,
      fromMonth: 3,
      toMonth: 2,
      statuses: ALL_STATUSES,
      brandId: null,
    });
    expect(result.map((i) => i.invoiceNumber)).toEqual(["JUN", "DEC"]);
  });
});

describe("summarize", () => {
  it("groups totals by currency and counts statuses", () => {
    const invoices = [
      makeInvoice("2025-04-01", { currency: "INR", total: 1000, status: "paid" }),
      makeInvoice("2025-05-01", { currency: "INR", total: 500, status: "sent" }),
      makeInvoice("2025-06-01", { currency: "USD", total: 200, status: "paid" }),
    ];
    const summary = summarize(invoices);
    expect(summary.count).toBe(3);
    expect(summary.totalsByCurrency).toEqual([
      { currency: "INR", total: 1500, count: 2 },
      { currency: "USD", total: 200, count: 1 },
    ]);
    expect(summary.statusCounts).toEqual({ paid: 2, sent: 1 });
  });

  it("defaults missing currency to INR", () => {
    const inv = makeInvoice("2025-04-01", { total: 100 });
    // @ts-expect-error simulate legacy invoice without a currency
    delete inv.currency;
    const summary = summarize([inv]);
    expect(summary.totalsByCurrency).toEqual([{ currency: "INR", total: 100, count: 1 }]);
  });
});

describe("groupByCurrency", () => {
  it("groups invoices by currency in display order", () => {
    const invoices = [
      makeInvoice("2025-04-01", { currency: "USD" as Currency, invoiceNumber: "U1" }),
      makeInvoice("2025-04-02", { currency: "INR" as Currency, invoiceNumber: "I1" }),
      makeInvoice("2025-04-03", { currency: "USD" as Currency, invoiceNumber: "U2" }),
    ];
    const groups = groupByCurrency(invoices);
    expect(groups.map((g) => g.currency)).toEqual(["INR", "USD"]);
    expect(groups[1].invoices.map((i) => i.invoiceNumber)).toEqual(["U1", "U2"]);
  });
});
