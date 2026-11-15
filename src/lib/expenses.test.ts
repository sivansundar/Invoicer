import { describe, expect, it } from "vitest";
import { EMPTY_EXPENSE_FIELDS, expenseFileProblem, expenseFyStartYear, reviewReasons } from "./expenses";

const good = {
  ...EMPTY_EXPENSE_FIELDS,
  status: "ready" as const,
  vendorName: "Acme Supplies",
  date: "2026-05-10",
  items: [
    { description: "Paper", hsnSac: "4802", quantity: 2, rate: 500, amount: 1000, taxPercent: 18 },
    { description: "Ink", hsnSac: null, quantity: 1, rate: 200, amount: 200, taxPercent: 18 },
  ],
  subtotal: 1200,
  cgst: 108,
  sgst: 108,
  total: 1416,
};

describe("reviewReasons", () => {
  it("passes an expense that adds up", () => {
    expect(reviewReasons(good)).toEqual([]);
  });

  it("tolerates a rupee of rounding", () => {
    expect(reviewReasons({ ...good, total: 1416.5 })).toEqual([]);
  });

  it("flags a total that doesn't match subtotal plus tax (a missed tax line)", () => {
    expect(reviewReasons({ ...good, sgst: 0 })).toEqual(["Subtotal plus tax doesn't add up to the total."]);
  });

  it("flags line items that don't add up to the subtotal (a misread amount)", () => {
    const items = [{ ...good.items[0], amount: 100 }, good.items[1]];
    expect(reviewReasons({ ...good, items })).toEqual(["Line items don't add up to the subtotal."]);
  });

  it("counts IGST and other taxes towards the total", () => {
    expect(reviewReasons({ ...good, cgst: 0, sgst: 0, igst: 200, otherTax: 16 })).toEqual([]);
  });

  it("flags a missing date and vendor, and says only one thing for an unreadable file", () => {
    expect(reviewReasons({ ...good, date: null, vendorName: " " })).toEqual(["No invoice date.", "No vendor name."]);
    expect(reviewReasons({ ...EMPTY_EXPENSE_FIELDS, status: "failed" })).toHaveLength(1);
  });
});

describe("expense helpers", () => {
  it("accepts PDFs and common images up to 4 MB only", () => {
    expect(expenseFileProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(expenseFileProblem({ type: "image/heic", size: 1000 })).toMatch(/PDF/);
    expect(expenseFileProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(expenseFileProblem({ type: "image/png", size: 5 * 1024 * 1024 })).toMatch(/4 MB/);
  });

  it("puts January to March in the financial year that started the year before", () => {
    expect(expenseFyStartYear("2026-03-31")).toBe(2025);
    expect(expenseFyStartYear("2026-04-01")).toBe(2026);
    expect(expenseFyStartYear(null)).toBeNull();
  });
});
