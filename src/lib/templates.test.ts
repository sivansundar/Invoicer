import { describe, expect, it } from "vitest";
import { sampleInvoiceForPreview, templateBrandNames } from "./templates";
import type { Brand, FollowupConfig, Invoice } from "./types";

function invoice(id: string, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id,
    status: "draft",
    ...overrides,
  } as Invoice;
}

function brand(id: string, name: string, templateId: string): Brand {
  return {
    id,
    name,
    followup: { templateId } as FollowupConfig,
  } as Brand;
}

describe("sampleInvoiceForPreview", () => {
  it("returns null when there are no invoices at all", () => {
    expect(sampleInvoiceForPreview([])).toBeNull();
  });

  it("prefers the first overdue invoice over everything else", () => {
    const invoices = [
      invoice("draft-1", { status: "draft" }),
      invoice("sent-1", { status: "sent" }),
      invoice("overdue-1", { status: "overdue" }),
      invoice("overdue-2", { status: "overdue" }),
    ];
    expect(sampleInvoiceForPreview(invoices)?.id).toBe("overdue-1");
  });

  it("falls back to the first sent invoice when nothing is overdue", () => {
    const invoices = [
      invoice("paid-1", { status: "paid" }),
      invoice("sent-1", { status: "sent" }),
      invoice("sent-2", { status: "sent" }),
    ];
    expect(sampleInvoiceForPreview(invoices)?.id).toBe("sent-1");
  });

  it("falls back to the first invoice of any status when nothing is overdue or sent", () => {
    const invoices = [invoice("paid-1", { status: "paid" }), invoice("draft-1", { status: "draft" })];
    expect(sampleInvoiceForPreview(invoices)?.id).toBe("paid-1");
  });

  it("picks a single draft invoice rather than returning null", () => {
    // A brand-new user with exactly one invoice, still a draft, has no
    // overdue or sent invoice — this must not fall through to null.
    const invoices = [invoice("draft-1", { status: "draft" })];
    expect(sampleInvoiceForPreview(invoices)?.id).toBe("draft-1");
  });

  it("never sorts — respects storage order even when a later overdue invoice would sort earlier", () => {
    const invoices = [
      invoice("sent-1", { status: "sent" }),
      invoice("overdue-1", { status: "overdue" }),
    ];
    // Overdue still wins over sent regardless of position...
    expect(sampleInvoiceForPreview(invoices)?.id).toBe("overdue-1");

    const sentOnly = [invoice("sent-2", { status: "sent" }), invoice("sent-1", { status: "sent" })];
    // ...and among same-status invoices, array order (not id, not date) wins.
    expect(sampleInvoiceForPreview(sentOnly)?.id).toBe("sent-2");
  });
});

describe("templateBrandNames", () => {
  const brands: Brand[] = [
    brand("b1", "Sivan Studio", "tpl-gentle-nudge"),
    brand("b2", "Basecamp Co", "tpl-final-notice"),
    brand("b3", "Acme Design", "tpl-gentle-nudge"),
  ];

  it("returns an empty array when no brand uses this template", () => {
    expect(templateBrandNames("tpl-unused", brands)).toEqual([]);
  });

  it("returns an empty array for an empty brand list", () => {
    expect(templateBrandNames("tpl-gentle-nudge", [])).toEqual([]);
  });

  it("returns every brand attached to the template, preserving brand array order", () => {
    expect(templateBrandNames("tpl-gentle-nudge", brands)).toEqual(["Sivan Studio", "Acme Design"]);
  });

  it("returns a single brand when only one is attached", () => {
    expect(templateBrandNames("tpl-final-notice", brands)).toEqual(["Basecamp Co"]);
  });
});
