import { describe, expect, it } from "vitest";
import { brandPreviewBody, latestInvoiceForBrand } from "./brand-preview";
import type { Invoice } from "./types";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    invoiceNumber: "SDC-2026-004",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-05-01",
    dueDate: "2026-05-15",
    client: { companyName: "Northwind Studio", address: "48 Residency Road" },
    items: [{ id: "l1", description: "Design retainer", amount: 50000, tax: 18 }],
    subtotal: 50000,
    totalTax: 9000,
    total: 59000,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    brandSnapshot: {
      name: "Sundar Design Co",
      address: "123 MG Road",
      invoicePrefix: "SDC",
      accentColor: "#2563eb",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
      invoiceDesign: "modern",
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("latestInvoiceForBrand", () => {
  it("returns null when the brand has no id yet — the create form", () => {
    expect(latestInvoiceForBrand([invoice()], undefined)).toBeNull();
  });

  it("returns null when the brand has never issued an invoice", () => {
    expect(latestInvoiceForBrand([invoice({ brandId: "other" })], "b1")).toBeNull();
  });

  it("picks the most recently created invoice", () => {
    const older = invoice({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = invoice({ id: "new", createdAt: "2026-06-01T00:00:00.000Z" });

    expect(latestInvoiceForBrand([older, newer], "b1")?.id).toBe("new");
    // Array order must not decide the answer.
    expect(latestInvoiceForBrand([newer, older], "b1")?.id).toBe("new");
  });

  it("ignores other brands' invoices even when they are newer", () => {
    const mine = invoice({ id: "mine", createdAt: "2026-01-01T00:00:00.000Z" });
    const theirs = invoice({
      id: "theirs",
      brandId: "b2",
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    expect(latestInvoiceForBrand([mine, theirs], "b1")?.id).toBe("mine");
  });

  it("is stable when two invoices share a createdAt", () => {
    const a = invoice({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = invoice({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });

    expect(latestInvoiceForBrand([a, b], "b1")?.id).toBe("a");
    expect(latestInvoiceForBrand([b, a], "b1")?.id).toBe("b");
  });

  it("sorts by createdAt, not billDate — a back-dated invoice entered today is the latest", () => {
    const backDated = invoice({
      id: "back-dated",
      billDate: "2025-01-01",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const older = invoice({
      id: "older",
      billDate: "2026-05-01",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    expect(latestInvoiceForBrand([older, backDated], "b1")?.id).toBe("back-dated");
  });
});

describe("brandPreviewBody — with a real invoice", () => {
  it("passes the invoice's own contents through untouched", () => {
    const body = brandPreviewBody(invoice(), "SDC");

    expect(body.invoiceNumber).toBe("SDC-2026-004");
    expect(body.billDate).toBe("2026-05-01");
    expect(body.dueDate).toBe("2026-05-15");
    expect(body.client.companyName).toBe("Northwind Studio");
    expect(body.items).toHaveLength(1);
    expect(body.currency).toBe("INR");
  });

  it("never rewrites a real invoice number to match the live prefix", () => {
    // The number was assigned when the invoice was issued. Re-deriving it from
    // a prefix being edited right now would show a document that never existed.
    const body = brandPreviewBody(invoice(), "CHANGED");

    expect(body.invoiceNumber).toBe("SDC-2026-004");
  });

  it("marks the preview paid only when the invoice is paid", () => {
    expect(brandPreviewBody(invoice({ status: "paid" }), "SDC").isPaid).toBe(true);
    expect(brandPreviewBody(invoice({ status: "overdue" }), "SDC").isPaid).toBe(false);
    expect(brandPreviewBody(invoice({ status: "draft" }), "SDC").isPaid).toBe(false);
  });

  it("carries notes through, including their absence", () => {
    expect(brandPreviewBody(invoice({ notes: "Thanks!" }), "SDC").notes).toBe("Thanks!");
    expect(brandPreviewBody(invoice({ notes: undefined }), "SDC").notes).toBeUndefined();
  });
});

describe("brandPreviewBody — placeholder", () => {
  it("builds its number from the live prefix", () => {
    expect(brandPreviewBody(null, "SDC").invoiceNumber).toBe("SDC-2026-001");
  });

  it("normalises a prefix that is still being typed", () => {
    expect(brandPreviewBody(null, " sdc ").invoiceNumber).toBe("SDC-2026-001");
  });

  it("falls back to INV when no prefix has been entered", () => {
    expect(brandPreviewBody(null, "").invoiceNumber).toBe("INV-2026-001");
    expect(brandPreviewBody(null, "   ").invoiceNumber).toBe("INV-2026-001");
  });

  it("includes both a taxed and an untaxed line so every design renders its tax column", () => {
    const { items } = brandPreviewBody(null, "SDC");

    expect(items.length).toBeGreaterThan(1);
    expect(items.some((item) => item.tax > 0)).toBe(true);
    expect(items.some((item) => item.tax === 0)).toBe(true);
  });

  it("is never shown as paid — a Paid stamp on invented data is noise", () => {
    expect(brandPreviewBody(null, "SDC").isPaid).toBe(false);
  });

  it("renders identically on every call, so the preview never shifts under you", () => {
    expect(brandPreviewBody(null, "SDC")).toEqual(brandPreviewBody(null, "SDC"));
  });
});
