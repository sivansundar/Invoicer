import { describe, expect, it } from "vitest";
import { chunkPaymentFieldRows, paymentDetailFields, taxLabel } from "./invoice-preview";
import type { AchDetails, BankDetails, LineItem } from "./types";
import type { PaymentDetailField } from "./invoice-preview";

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

function ach(overrides: Partial<AchDetails> = {}): AchDetails {
  return {
    accountName: "",
    accountNumber: "",
    routingNumber: "",
    bankName: "",
    ...overrides,
  };
}

describe("paymentDetailFields", () => {
  describe("ifsc (the default when method is undefined)", () => {
    it("is empty when bankDetails is undefined", () => {
      expect(paymentDetailFields(undefined, undefined, undefined, undefined)).toEqual([]);
    });

    it("is empty when every field is blank", () => {
      expect(paymentDetailFields(bank(), undefined, "ifsc", undefined)).toEqual([]);
    });

    it("is empty when fields are only whitespace", () => {
      expect(paymentDetailFields(bank({ accountName: "   " }), undefined, "ifsc", undefined)).toEqual([]);
    });

    it("lists only the non-empty fields, in the brief's order", () => {
      const fields = paymentDetailFields(
        bank({ accountNumber: "12345", accountName: "Acme LLC" }),
        undefined,
        "ifsc",
        undefined
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
        }),
        undefined,
        "ifsc",
        undefined
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

    it("is used when method is undefined, the same as an invoice issued before ACH existed", () => {
      const fields = paymentDetailFields(bank({ accountName: "Acme LLC" }), undefined, undefined, undefined);
      expect(fields).toEqual([{ label: "Account name", value: "Acme LLC" }]);
    });
  });

  describe("ach", () => {
    it("is empty when every field is blank", () => {
      expect(paymentDetailFields(undefined, ach(), "ach", undefined)).toEqual([]);
    });

    it("lists only the non-empty fields, in ACH order", () => {
      const fields = paymentDetailFields(
        undefined,
        ach({ accountName: "Acme LLC", routingNumber: "021000021" }),
        "ach",
        undefined
      );
      expect(fields).toEqual([
        { label: "Account name", value: "Acme LLC" },
        { label: "ACH routing number", value: "021000021" },
      ]);
    });

    it("includes every field, in order, capitalizing account type", () => {
      const fields = paymentDetailFields(
        undefined,
        ach({
          accountName: "Acme LLC",
          bankName: "Wise",
          accountNumber: "98765",
          routingNumber: "021000021",
          accountType: "current",
        }),
        "ach",
        true
      );
      expect(fields).toEqual([
        { label: "Account name", value: "Acme LLC" },
        { label: "Bank", value: "Wise" },
        { label: "Account number", value: "98765" },
        { label: "ACH routing number", value: "021000021" },
        { label: "Account type", value: "Current" },
      ]);
    });

    it("omits account type unless the invoice opts in to showing it", () => {
      const details = ach({ accountName: "Acme LLC", accountType: "savings" });
      expect(paymentDetailFields(undefined, details, "ach", false)).toEqual([
        { label: "Account name", value: "Acme LLC" },
      ]);
      expect(paymentDetailFields(undefined, details, "ach", undefined)).toEqual([
        { label: "Account name", value: "Acme LLC" },
      ]);
      expect(paymentDetailFields(undefined, details, "ach", true)).toEqual([
        { label: "Account name", value: "Acme LLC" },
        { label: "Account type", value: "Savings" },
      ]);
    });

    it("falls back to the IFSC fields when the snapshot has no achDetails", () => {
      const fields = paymentDetailFields(
        bank({ accountName: "Acme LLC", ifscCode: "HDFC0001" }),
        undefined,
        "ach",
        undefined
      );
      expect(fields).toEqual([
        { label: "Account name", value: "Acme LLC" },
        { label: "IFSC", value: "HDFC0001" },
      ]);
    });
  });
});

function field(label: string): PaymentDetailField {
  return { label, value: `${label} value` };
}

describe("chunkPaymentFieldRows", () => {
  it("is empty when there are no fields", () => {
    expect(chunkPaymentFieldRows([])).toEqual([]);
  });

  it("puts a single field in a row of its own", () => {
    const a = field("Account name");
    expect(chunkPaymentFieldRows([a])).toEqual([[a]]);
  });

  it("pairs up an even number of fields into full rows", () => {
    const [a, b, c, d] = ["A", "B", "C", "D"].map(field);
    expect(chunkPaymentFieldRows([a, b, c, d])).toEqual([
      [a, b],
      [c, d],
    ]);
  });

  it("leaves a trailing odd field alone in the last row", () => {
    const [a, b, c, d, e] = ["A", "B", "C", "D", "E"].map(field);
    expect(chunkPaymentFieldRows([a, b, c, d, e])).toEqual([
      [a, b],
      [c, d],
      [e],
    ]);
  });
});
