import { describe, expect, it } from "vitest";
import { validateImportedBackup, validateImportedInvoices } from "./import-validation";

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

  it("skips a record whose items array contains a non-record element", () => {
    const nullItem = wellFormedInvoice({ id: "i1", items: [null] });
    const stringItem = wellFormedInvoice({ id: "i2", items: ["a string"] });

    const result = validateImportedInvoices([nullItem, stringItem]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });

  it("skips a record whose item is an object missing a field a rendering screen depends on", () => {
    const emptyItem = wellFormedInvoice({ id: "i1", items: [{}] });
    const missingAmount = wellFormedInvoice({
      id: "i2",
      items: [{ id: "li1", description: "Website redesign", tax: 18 }],
    });

    const result = validateImportedInvoices([emptyItem, missingAmount]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.valid).toHaveLength(0);
    expect(result.skipped).toBe(2);
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

function wellFormedBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    name: "Sivan Studio",
    address: "12 MG Road, Bengaluru",
    email: "hello@sivanstudio.com",
    invoicePrefix: "SC",
    createdAt: "2026-01-01T00:00:00.000Z",
    bankDetails: {
      accountName: "Sivan Studio",
      accountNumber: "1234567890",
      bankName: "HDFC Bank",
      ifscCode: "HDFC0000123",
    },
    ...overrides,
  };
}

function wellFormedClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    companyName: "Acme Studio",
    address: "12 Residency Rd, Bengaluru 560025",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function wellFormedTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    name: "Gentle nudge",
    subject: "Following up on {{invoiceNumber}}",
    tone: "Friendly",
    body: "Hi {{clientName}}, just a friendly nudge...",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateImportedBackup", () => {
  it("rejects a payload that isn't a JSON object (arrays are handled by the legacy path instead)", () => {
    expect(validateImportedBackup([])).toEqual({ ok: false });
    expect(validateImportedBackup("just a string")).toEqual({ ok: false });
    expect(validateImportedBackup(42)).toEqual({ ok: false });
    expect(validateImportedBackup(null)).toEqual({ ok: false });
  });

  it("treats an absent collection as empty, not an error", () => {
    const result = validateImportedBackup({ version: 2, invoices: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.brands).toEqual({ valid: [], skipped: 0, invalidShape: false });
    expect(result.clients).toEqual({ valid: [], skipped: 0, invalidShape: false });
    expect(result.templates).toEqual({ valid: [], skipped: 0, invalidShape: false });
  });

  it("flags a collection that isn't an array without rejecting the rest of the file", () => {
    const brand = wellFormedBrand();
    const result = validateImportedBackup({
      version: 2,
      brands: [brand],
      clients: "not a list",
      templates: [],
      invoices: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.brands).toEqual({ valid: [brand], skipped: 0, invalidShape: false });
    expect(result.clients).toEqual({ valid: [], skipped: 0, invalidShape: true });
  });

  it("validates brands, clients and templates independently, skipping malformed records", () => {
    const goodBrand = wellFormedBrand();
    const badBrand = wellFormedBrand({ id: "b2", bankDetails: undefined });
    const goodClient = wellFormedClient();
    const badClient = wellFormedClient({ id: "c2", companyName: "" });
    const goodTemplate = wellFormedTemplate();
    const badTemplate = wellFormedTemplate({ id: "tpl-2", tone: "Aggressive" });

    const result = validateImportedBackup({
      version: 2,
      brands: [goodBrand, badBrand, null],
      clients: [goodClient, badClient],
      templates: [goodTemplate, badTemplate],
      invoices: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.brands).toEqual({ valid: [goodBrand], skipped: 2, invalidShape: false });
    expect(result.clients).toEqual({ valid: [goodClient], skipped: 1, invalidShape: false });
    expect(result.templates).toEqual({ valid: [goodTemplate], skipped: 1, invalidShape: false });
  });

  it("passes a well-formed full backup through intact", () => {
    const brand = wellFormedBrand();
    const client = wellFormedClient();
    const template = wellFormedTemplate();
    const invoice = wellFormedInvoice();

    const result = validateImportedBackup({
      version: 2,
      exportedAt: "2026-07-28T00:00:00.000Z",
      brands: [brand],
      clients: [client],
      templates: [template],
      invoices: [invoice],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok: true");
    expect(result.brands).toEqual({ valid: [brand], skipped: 0, invalidShape: false });
    expect(result.clients).toEqual({ valid: [client], skipped: 0, invalidShape: false });
    expect(result.templates).toEqual({ valid: [template], skipped: 0, invalidShape: false });
    expect(result.invoices).toEqual({ valid: [invoice], skipped: 0, invalidShape: false });
  });
});
