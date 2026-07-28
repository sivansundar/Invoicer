import { describe, expect, it } from "vitest";
import { invoiceTabCounts, runInvoiceTablePipeline } from "./invoice-table";
import type { Invoice } from "./types";

function inv(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "1",
    invoiceNumber: "INV-1",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-07-10",
    dueDate: "2026-07-20",
    client: { companyName: "Acme", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "",
    brandSnapshot: {} as Invoice["brandSnapshot"],
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

function run(overrides: Partial<Parameters<typeof runInvoiceTablePipeline>[0]> = {}) {
  return runInvoiceTablePipeline({
    invoices: [],
    brandId: null,
    tab: "all",
    query: "",
    page: 1,
    pageSize: 10,
    ...overrides,
  });
}

describe("runInvoiceTablePipeline", () => {
  it("scopes to the active brand only, matching StatCards/RevenueChart", () => {
    const invoices = [
      inv({ id: "1", brandId: "b1" }),
      inv({ id: "2", brandId: "b2" }),
      inv({ id: "3", brandId: "b1" }),
    ];
    const result = run({ invoices, brandId: "b1" });
    expect(result.rows.map((r) => r.id).sort()).toEqual(["1", "3"]);
    expect(result.filteredCount).toBe(2);
  });

  it("shows every brand when brandId is null", () => {
    const invoices = [inv({ id: "1", brandId: "b1" }), inv({ id: "2", brandId: "b2" })];
    const result = run({ invoices, brandId: null });
    expect(result.filteredCount).toBe(2);
  });

  it("filters by status tab", () => {
    const invoices = [
      inv({ id: "1", status: "paid" }),
      inv({ id: "2", status: "sent" }),
      inv({ id: "3", status: "paid" }),
    ];
    const result = run({ invoices, tab: "paid" });
    expect(result.rows.map((r) => r.id).sort()).toEqual(["1", "3"]);
  });

  it("the 'all' tab includes every status", () => {
    const invoices = [
      inv({ id: "1", status: "paid" }),
      inv({ id: "2", status: "draft" }),
      inv({ id: "3", status: "overdue" }),
    ];
    const result = run({ invoices, tab: "all" });
    expect(result.filteredCount).toBe(3);
  });

  it("searches invoice number case-insensitively", () => {
    const invoices = [
      inv({ id: "1", invoiceNumber: "ABC-2026-001" }),
      inv({ id: "2", invoiceNumber: "XYZ-2026-002" }),
    ];
    const result = run({ invoices, query: "abc-2026" });
    expect(result.rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("searches client company name case-insensitively", () => {
    const invoices = [
      inv({ id: "1", client: { companyName: "Northwind Traders", address: "" } }),
      inv({ id: "2", client: { companyName: "Acme Corp", address: "" } }),
    ];
    const result = run({ invoices, query: "NORTHWIND" });
    expect(result.rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("matches either field, not requiring both", () => {
    const invoices = [
      inv({ id: "1", invoiceNumber: "MATCH-001", client: { companyName: "Zzz", address: "" } }),
      inv({ id: "2", invoiceNumber: "OTHER-002", client: { companyName: "Match Co", address: "" } }),
      inv({ id: "3", invoiceNumber: "OTHER-003", client: { companyName: "Zzz", address: "" } }),
    ];
    const result = run({ invoices, query: "match" });
    expect(result.rows.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("ignores leading/trailing whitespace in the search query", () => {
    const invoices = [inv({ id: "1", invoiceNumber: "INV-42" })];
    const result = run({ invoices, query: "  inv-42  " });
    expect(result.rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("returns an empty result with filteredCount 0 and totalPages 1 when nothing matches", () => {
    const invoices = [inv({ id: "1", invoiceNumber: "INV-1" })];
    const result = run({ invoices, query: "no-such-invoice" });
    expect(result.rows).toEqual([]);
    expect(result.filteredCount).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it("returns an empty result for an empty invoice list without dividing by zero", () => {
    const result = run({ invoices: [] });
    expect(result.rows).toEqual([]);
    expect(result.filteredCount).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it("clamps an out-of-range page down to the last valid page instead of returning nothing", () => {
    const invoices = Array.from({ length: 25 }, (_, i) => inv({ id: String(i) }));
    // pageSize 10 over 25 rows -> 3 pages. Requesting page 10 must not go blank.
    const result = run({ invoices, page: 10, pageSize: 10 });
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(3);
    expect(result.rows).toHaveLength(5);
  });

  it("never reports zero total pages, even with zero rows", () => {
    const result = run({ invoices: [], page: 1, pageSize: 10 });
    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("slices the requested page at the given page size", () => {
    const invoices = Array.from({ length: 25 }, (_, i) =>
      inv({ id: String(i), createdAt: new Date(2026, 0, i + 1).toISOString() })
    );
    const page1 = run({ invoices, page: 1, pageSize: 10 });
    const page2 = run({ invoices, page: 2, pageSize: 10 });
    const page3 = run({ invoices, page: 3, pageSize: 10 });
    expect(page1.rows).toHaveLength(10);
    expect(page2.rows).toHaveLength(10);
    expect(page3.rows).toHaveLength(5);
    // Newest first (createdAt desc), and no overlap/gap across pages.
    const ids = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(25);
  });

  it("resolves page 1 as valid the moment the filtered set shrinks to fit, mirroring a filter-change reset", () => {
    // Simulates: user was on page 3 (30 filtered rows at pageSize 10), then
    // typed a search query that narrows the set to 2 rows. Even if the caller
    // forgot to reset `page` to 1, the pipeline must not present a blank page.
    const invoices = [
      inv({ id: "1", invoiceNumber: "KEEP-1" }),
      inv({ id: "2", invoiceNumber: "KEEP-2" }),
      ...Array.from({ length: 28 }, (_, i) => inv({ id: `drop-${i}`, invoiceNumber: "OTHER" })),
    ];
    const result = run({ invoices, query: "keep", page: 3, pageSize: 10 });
    expect(result.page).toBe(1);
    expect(result.rows.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });
});

describe("invoiceTabCounts", () => {
  it("counts every status plus an 'all' total", () => {
    const invoices = [
      inv({ status: "paid" }),
      inv({ status: "paid" }),
      inv({ status: "sent" }),
      inv({ status: "draft" }),
      inv({ status: "overdue" }),
    ];
    expect(invoiceTabCounts(invoices, null)).toEqual({
      all: 5,
      paid: 2,
      sent: 1,
      draft: 1,
      overdue: 1,
    });
  });

  it("scopes counts to the active brand, independent of any search text", () => {
    const invoices = [
      inv({ brandId: "b1", status: "paid" }),
      inv({ brandId: "b2", status: "paid" }),
      inv({ brandId: "b1", status: "sent" }),
    ];
    expect(invoiceTabCounts(invoices, "b1")).toEqual({
      all: 2,
      paid: 1,
      sent: 1,
      draft: 0,
      overdue: 0,
    });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(invoiceTabCounts([], null)).toEqual({
      all: 0,
      paid: 0,
      sent: 0,
      draft: 0,
      overdue: 0,
    });
  });
});
