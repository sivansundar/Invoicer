import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, nextInvoiceNumber, parseInvoiceNumber } from "./numbering";
import type { Brand, Invoice } from "./types";

const brand = { id: "b1", invoicePrefix: "SC" } as Brand;

function inv(invoiceNumber: string, brandId = "b1"): Invoice {
  return { id: invoiceNumber, invoiceNumber, brandId } as Invoice;
}

describe("parseInvoiceNumber", () => {
  it("parses the legacy hyphen-free format", () => {
    expect(parseInvoiceNumber("SC2026001", "SC")).toEqual({ year: 2026, seq: 1 });
  });

  it("parses the v2 hyphenated format", () => {
    expect(parseInvoiceNumber("SC-2026-014", "SC")).toEqual({ year: 2026, seq: 14 });
  });

  it("parses sequences longer than three digits", () => {
    expect(parseInvoiceNumber("SC-2026-1041", "SC")).toEqual({ year: 2026, seq: 1041 });
  });

  it("returns null when the prefix does not match", () => {
    expect(parseInvoiceNumber("NL-2026-001", "SC")).toBeNull();
  });

  it("returns null for unparseable values", () => {
    expect(parseInvoiceNumber("SC-draft", "SC")).toBeNull();
  });

  it("treats a prefix containing regex characters literally", () => {
    expect(parseInvoiceNumber("A.B-2026-002", "A.B")).toEqual({ year: 2026, seq: 2 });
    expect(parseInvoiceNumber("AXB-2026-002", "A.B")).toBeNull();
  });
});

describe("formatInvoiceNumber", () => {
  it("pads the sequence to three digits", () => {
    expect(formatInvoiceNumber("SC", 2026, 7)).toBe("SC-2026-007");
  });

  it("does not truncate sequences past 999", () => {
    expect(formatInvoiceNumber("SC", 2026, 1041)).toBe("SC-2026-1041");
  });
});

describe("nextInvoiceNumber", () => {
  it("starts at 001 when the brand has no invoices", () => {
    expect(nextInvoiceNumber(brand, [], 2026)).toBe("SC-2026-001");
  });

  it("continues from the highest sequence across both formats", () => {
    const invoices = [inv("SC2026001"), inv("SC-2026-014"), inv("SC2026009")];
    expect(nextInvoiceNumber(brand, invoices, 2026)).toBe("SC-2026-015");
  });

  it("ignores invoices belonging to other brands", () => {
    const invoices = [inv("SC-2026-003"), inv("NL-2026-099", "b2")];
    expect(nextInvoiceNumber(brand, invoices, 2026)).toBe("SC-2026-004");
  });

  it("restarts numbering in a new year", () => {
    const invoices = [inv("SC-2026-014")];
    expect(nextInvoiceNumber(brand, invoices, 2027)).toBe("SC-2027-001");
  });
});
