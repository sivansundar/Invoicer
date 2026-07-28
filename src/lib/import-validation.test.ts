import { describe, expect, it } from "vitest";
import { validateImportedInvoices } from "./import-validation";

function wellFormedInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    invoiceNumber: "SC2026001",
    brandId: "b1",
    currency: "INR",
    status: "paid",
    billDate: "2026-07-10",
    dueDate: "2026-07-24",
    client: {
      companyName: "Acme Studio",
      name: "Priya Nair",
      address: "12 Residency Rd, Bengaluru 560025",
    },
    items: [{ id: "li1", description: "Website redesign", amount: 40000, tax: 18 }],
    subtotal: 40000,
    totalTax: 7200,
    total: 47200,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateImportedInvoices", () => {
  it("rejects a non-array payload outright", () => {
    expect(validateImportedInvoices({ id: "not-an-array" })).toEqual({ ok: false });
    expect(validateImportedInvoices("just a string")).toEqual({ ok: false });
    expect(validateImportedInvoices(42)).toEqual({ ok: false });
    expect(validateImportedInvoices(null)).toEqual({ ok: false });
  });

  it("skips array elements that are not objects", () => {
    const result = validateImportedInvoices([null, "garbage", 42, wellFormedInvoice()]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it("skips a record missing a field a rendering screen depends on", () => {
    const missingInvoiceNumber = wellFormedInvoice({ invoiceNumber: undefined });
    const missingClientCompany = wellFormedInvoice({ id: "i2", client: { name: "No company" } });
    const badStatus = wellFormedInvoice({ id: "i3", status: "in-limbo" });
    const badTotals = wellFormedInvoice({ id: "i4", total: "47200" });

    const result = validateImportedInvoices([
      missingInvoiceNumber,
      missingClientCompany,
      badStatus,
      badTotals,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toHaveLength(0);
    expect(result.skipped).toBe(4);
  });

  it("passes a well-formed payload through intact", () => {
    const invoice = wellFormedInvoice();
    const result = validateImportedInvoices([invoice]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toEqual([invoice]);
    expect(result.skipped).toBe(0);
  });

  it("keeps well-formed records and skips malformed ones in a mixed payload", () => {
    const good1 = wellFormedInvoice({ id: "i1" });
    const good2 = wellFormedInvoice({ id: "i2", invoiceNumber: "SC2026002" });
    const bad = { id: "i3" }; // missing everything else

    const result = validateImportedInvoices([good1, null, bad, good2]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toEqual([good1, good2]);
    expect(result.skipped).toBe(2);
  });
});
