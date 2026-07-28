import { describe, expect, it } from "vitest";
import { paymentDetailFields, taxLabel } from "./invoice-preview";
import type { BankDetails, LineItem } from "./types";

function item(tax: number, amount = 100): LineItem {
  return { id: Math.random().toString(), description: "x", amount, tax };
}

describe("taxLabel", () => {
  it("reads plain Tax with no line items at all", () => {
    expect(taxLabel([])).toBe("Tax");
  });

  it("reads plain Tax when no item carries any tax", () => {
    expect(taxLabel([item(0), item(0)])).toBe("Tax");
  });

  it("reads GST {n}% when every taxed item shares one rate", () => {
    expect(taxLabel([item(18), item(18), item(0)])).toBe("GST 18%");
  });

  it("reads GST {n}% for a single taxed item", () => {
    expect(taxLabel([item(5)])).toBe("GST 5%");
  });

  it("reads plain Tax when two different non-zero rates appear", () => {
    expect(taxLabel([item(18), item(5)])).toBe("Tax");
  });
});

function bank(overrides: Partial<BankDetails> = {}): BankDetails {
  return {
    accountName: "",
    accountNumber: "",
    bankName: "",
    ifscCode: "",
    ...overrides,
  };
}

describe("paymentDetailFields", () => {
  it("is empty when bankDetails is undefined", () => {
    expect(paymentDetailFields(undefined)).toEqual([]);
  });

  it("is empty when every field is blank", () => {
    expect(paymentDetailFields(bank())).toEqual([]);
  });

  it("is empty when fields are only whitespace", () => {
    expect(paymentDetailFields(bank({ accountName: "   " }))).toEqual([]);
  });

  it("lists only the non-empty fields, in the brief's order", () => {
    const fields = paymentDetailFields(
      bank({ accountNumber: "12345", accountName: "Acme LLC" })
    );
    expect(fields).toEqual([
      { label: "Account name", value: "Acme LLC" },
      { label: "Account number", value: "12345" },
    ]);
  });

  it("includes every field, in order, when all are present", () => {
    const fields = paymentDetailFields(
      bank({
        accountName: "Acme LLC",
        bankName: "HDFC",
        branch: "Koramangala",
        accountNumber: "12345",
        ifscCode: "HDFC0001",
        upiId: "acme@upi",
      })
    );
    expect(fields).toEqual([
      { label: "Account name", value: "Acme LLC" },
      { label: "Bank", value: "HDFC" },
      { label: "Branch", value: "Koramangala" },
      { label: "Account number", value: "12345" },
      { label: "IFSC", value: "HDFC0001" },
      { label: "UPI ID", value: "acme@upi" },
    ]);
  });
});
