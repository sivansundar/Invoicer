import { describe, expect, it } from "vitest";
import { DEFAULT_INVOICE_DESIGN, INVOICE_DESIGN_OPTIONS, resolveInvoiceDesign } from "./invoice-design";

describe("resolveInvoiceDesign", () => {
  it("defaults an undefined design to modern", () => {
    expect(resolveInvoiceDesign(undefined)).toBe("modern");
    expect(resolveInvoiceDesign(undefined)).toBe(DEFAULT_INVOICE_DESIGN);
  });

  it("passes an explicit modern design through unchanged", () => {
    expect(resolveInvoiceDesign("modern")).toBe("modern");
  });

  it("passes an explicit classic design through unchanged", () => {
    expect(resolveInvoiceDesign("classic")).toBe("classic");
  });
});

describe("INVOICE_DESIGN_OPTIONS", () => {
  it("lists modern before classic, matching modern being the default", () => {
    expect(INVOICE_DESIGN_OPTIONS.map((o) => o.value)).toEqual(["modern", "classic"]);
  });

  it("gives every option a non-empty label and description", () => {
    for (const option of INVOICE_DESIGN_OPTIONS) {
      expect(option.label.trim()).not.toBe("");
      expect(option.description.trim()).not.toBe("");
    }
  });
});
