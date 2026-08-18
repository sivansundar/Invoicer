import { describe, expect, it } from "vitest";
import {
  dashboardScopeControls,
  hiddenOverdueCount,
  invoicesInFinancialYear,
  resolveBrandScope,
  resolveYearScope,
} from "./dashboard-scope";
import { makeInvoice, validBrand } from "@/test/factories";
import type { Brand, Invoice } from "./types";

const TODAY = new Date("2026-08-18T10:00:00.000Z");

function invoice(billDate: string, overrides: Partial<Invoice> = {}): Invoice {
  return makeInvoice({ id: `${billDate}-${overrides.id ?? "x"}`, billDate, ...overrides });
}

function brand(id: string, name: string): Brand {
  return validBrand({ id, name });
}

describe("dashboardScopeControls", () => {
  it("offers only financial years that have invoices, most recent first", () => {
    const controls = dashboardScopeControls(
      [invoice("2026-05-01"), invoice("2025-06-01"), invoice("2026-03-30")],
      []
    );

    // March 2026 belongs to FY 2025-26, so two years, not three.
    expect(controls.years.map((year) => year.startYear)).toEqual([2026, 2025]);
    expect(controls.yearIsChoice).toBe(true);
  });

  it("does not call a single financial year a choice", () => {
    const controls = dashboardScopeControls([invoice("2026-05-01"), invoice("2026-09-01")], []);

    expect(controls.years).toHaveLength(1);
    expect(controls.yearIsChoice).toBe(false);
  });

  it("has no years at all for an empty book", () => {
    const controls = dashboardScopeControls([], [brand("b1", "One")]);

    expect(controls.years).toEqual([]);
    expect(controls.yearIsChoice).toBe(false);
  });

  it.each([
    [0, "none"],
    [1, "none"],
    [2, "segmented"],
    [4, "segmented"],
    [5, "select"],
    [9, "select"],
  ])("renders %i brands as %s", (count, expected) => {
    const brands = Array.from({ length: count }, (_, i) => brand(`b${i}`, `Brand ${i}`));

    expect(dashboardScopeControls([], brands).brandControl).toBe(expected);
    expect(dashboardScopeControls([], brands).brands).toHaveLength(count);
  });
});

describe("resolveYearScope", () => {
  const controls = dashboardScopeControls(
    [invoice("2026-05-01"), invoice("2025-06-01")],
    []
  );

  it("defaults to the most recent year present", () => {
    expect(resolveYearScope(null, controls)).toBe(2026);
  });

  it("keeps a year that is still on the books", () => {
    expect(resolveYearScope(2025, controls)).toBe(2025);
  });

  it("falls back to the default when the picked year has vanished", () => {
    expect(resolveYearScope(2019, controls)).toBe(2026);
  });

  it("widens to every year on request", () => {
    expect(resolveYearScope("all", controls)).toBeNull();
  });

  it("resolves 'all' to the only year when there is just one", () => {
    const single = dashboardScopeControls([invoice("2026-05-01")], []);

    expect(resolveYearScope("all", single)).toBe(2026);
  });

  it("narrows to nothing when there are no invoices", () => {
    const empty = dashboardScopeControls([], []);

    expect(resolveYearScope(null, empty)).toBeNull();
    expect(resolveYearScope(2026, empty)).toBeNull();
  });
});

describe("resolveBrandScope", () => {
  const controls = dashboardScopeControls([], [brand("b1", "One"), brand("b2", "Two")]);

  it("keeps a brand that still exists", () => {
    expect(resolveBrandScope("b2", controls)).toBe("b2");
  });

  it("reads a deleted brand as all brands", () => {
    expect(resolveBrandScope("gone", controls)).toBeNull();
  });

  it("passes null through", () => {
    expect(resolveBrandScope(null, controls)).toBeNull();
  });
});

describe("invoicesInFinancialYear", () => {
  const book = [
    invoice("2026-04-01", { id: "a" }),
    invoice("2027-03-31", { id: "b" }),
    invoice("2026-03-31", { id: "c" }),
    invoice("2027-04-01", { id: "d" }),
  ];

  it("takes April through March, both ends included", () => {
    const inYear = invoicesInFinancialYear(book, 2026, TODAY);

    expect(inYear.map((inv) => inv.billDate)).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("returns the whole book when no year is in force", () => {
    expect(invoicesInFinancialYear(book, null, TODAY)).toHaveLength(4);
  });

  it("keeps an unparseable bill date only while unscoped", () => {
    const broken = [...book, invoice("", { id: "e" })];

    expect(invoicesInFinancialYear(broken, null, TODAY)).toHaveLength(5);
    expect(invoicesInFinancialYear(broken, 2026, TODAY)).toHaveLength(2);
  });
});

describe("hiddenOverdueCount", () => {
  // "sent" plus a due date in the past is what `effectiveStatus` reads as
  // overdue; nothing in this app ever stores "overdue" literally.
  const lastYear = invoice("2025-06-01", {
    id: "late",
    status: "sent",
    dueDate: "2025-06-15",
    brandId: "b1",
  });
  const thisYear = invoice("2026-05-01", {
    id: "current",
    status: "sent",
    dueDate: "2026-05-15",
    brandId: "b1",
  });

  it("counts overdue invoices the year scope is hiding", () => {
    expect(
      hiddenOverdueCount([lastYear, thisYear], { startYear: 2026, brandId: null }, TODAY)
    ).toBe(1);
  });

  it("counts nothing when the scope already spans every year", () => {
    expect(
      hiddenOverdueCount([lastYear, thisYear], { startYear: null, brandId: null }, TODAY)
    ).toBe(0);
  });

  it("ignores invoices that are not overdue", () => {
    const paid = invoice("2025-06-01", { id: "paid", status: "paid", dueDate: "2025-06-15" });
    const draft = invoice("2025-07-01", { id: "draft", status: "draft", dueDate: "2025-07-15" });
    const notYetDue = invoice("2025-06-01", {
      id: "future",
      status: "sent",
      dueDate: "2027-01-01",
    });

    expect(
      hiddenOverdueCount([paid, draft, notYetDue], { startYear: 2026, brandId: null }, TODAY)
    ).toBe(0);
  });

  it("respects the brand in force", () => {
    const otherBrand = invoice("2025-06-01", {
      id: "other",
      status: "sent",
      dueDate: "2025-06-15",
      brandId: "b2",
    });

    expect(
      hiddenOverdueCount([lastYear, otherBrand], { startYear: 2026, brandId: "b1" }, TODAY)
    ).toBe(1);
    expect(
      hiddenOverdueCount([lastYear, otherBrand], { startYear: 2026, brandId: "b2" }, TODAY)
    ).toBe(1);
    expect(
      hiddenOverdueCount([lastYear, otherBrand], { startYear: 2026, brandId: null }, TODAY)
    ).toBe(2);
  });

  it("leaves out an overdue invoice no year selection could reveal", () => {
    // No usable bill date means no financial year holds it — widening the
    // scope would not bring it back, so flagging it would be a dead button.
    const undateable = invoice("", { id: "broken", status: "sent", dueDate: "2025-01-01" });

    expect(
      hiddenOverdueCount([undateable], { startYear: 2026, brandId: null }, TODAY)
    ).toBe(0);
  });
});
