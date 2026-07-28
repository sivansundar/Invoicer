import { describe, expect, it } from "vitest";
import {
  brandDeleteGuard,
  derivePrefix,
  invoiceUsageLabel,
  MAX_LOGO_BYTES,
  nextUnusedAccentColor,
  validateLogoFile,
} from "./brands";
import { BRAND_PALETTE } from "./palette";
import type { Brand, Invoice } from "./types";

describe("derivePrefix", () => {
  it("takes the single initial of a one-word name", () => {
    expect(derivePrefix("Acme")).toBe("A");
  });

  it("takes the first letter of each word for a multi-word name", () => {
    expect(derivePrefix("Sundar Design Co")).toBe("SDC");
  });

  it("caps at the first three words for a longer name", () => {
    expect(derivePrefix("Alpha Beta Gamma Delta")).toBe("ABG");
  });

  it("uppercases lowercase input", () => {
    expect(derivePrefix("sundar design co")).toBe("SDC");
  });

  it("falls back to INV for a blank name", () => {
    expect(derivePrefix("")).toBe("INV");
  });

  it("falls back to INV for a whitespace-only name", () => {
    expect(derivePrefix("   ")).toBe("INV");
  });

  it("collapses repeated internal whitespace between words", () => {
    expect(derivePrefix("Sundar   Design   Co")).toBe("SDC");
  });
});

describe("brandDeleteGuard", () => {
  const brand = { id: "b1" } as Brand;

  function inv(brandId: string): Invoice {
    return { id: crypto.randomUUID(), brandId } as Invoice;
  }

  it("allows deleting a brand with no invoices", () => {
    expect(brandDeleteGuard(brand, [])).toEqual({ allowed: true, count: 0 });
  });

  it("ignores invoices belonging to other brands", () => {
    expect(brandDeleteGuard(brand, [inv("b2"), inv("b3")])).toEqual({
      allowed: true,
      count: 0,
    });
  });

  it("refuses deleting a brand with one invoice", () => {
    expect(brandDeleteGuard(brand, [inv("b1")])).toEqual({ allowed: false, count: 1 });
  });

  it("counts only the invoices belonging to this brand", () => {
    expect(brandDeleteGuard(brand, [inv("b1"), inv("b2"), inv("b1")])).toEqual({
      allowed: false,
      count: 2,
    });
  });
});

describe("invoiceUsageLabel", () => {
  it("reads a distinct empty-state line for zero invoices", () => {
    expect(invoiceUsageLabel(0)).toBe("No invoices use this brand yet");
  });

  it("singularizes exactly one invoice", () => {
    expect(invoiceUsageLabel(1)).toBe("1 invoice uses this brand");
  });

  it("pluralizes more than one invoice", () => {
    expect(invoiceUsageLabel(4)).toBe("4 invoices use this brand");
  });
});

describe("nextUnusedAccentColor", () => {
  it("returns the first palette colour when there are no brands yet", () => {
    expect(nextUnusedAccentColor([])).toBe(BRAND_PALETTE[0]);
  });

  it("skips colours already assigned to existing brands", () => {
    const brands = [{ accentColor: BRAND_PALETTE[0] } as Brand];
    expect(nextUnusedAccentColor(brands)).toBe(BRAND_PALETTE[1]);
  });

  it("finds the first gap even when assignments are out of order", () => {
    const brands = [
      { accentColor: BRAND_PALETTE[0] } as Brand,
      { accentColor: BRAND_PALETTE[2] } as Brand,
    ];
    expect(nextUnusedAccentColor(brands)).toBe(BRAND_PALETTE[1]);
  });

  it("cycles deterministically once every colour is taken", () => {
    const brands = BRAND_PALETTE.map((color) => ({ accentColor: color }) as Brand);
    expect(nextUnusedAccentColor(brands)).toBe(BRAND_PALETTE[brands.length % BRAND_PALETTE.length]);
  });
});

describe("validateLogoFile", () => {
  function file(bytes: number, type = "image/png"): File {
    return new File([new Uint8Array(bytes)], "logo.png", { type });
  }

  it("accepts a small image file", () => {
    expect(validateLogoFile(file(1024))).toBeNull();
  });

  it("accepts a file right at the size limit", () => {
    expect(validateLogoFile(file(MAX_LOGO_BYTES))).toBeNull();
  });

  it("rejects a non-image file", () => {
    expect(validateLogoFile(file(1024, "application/pdf"))).toBe("Logo must be an image file");
  });

  it("rejects a file over the size limit", () => {
    expect(validateLogoFile(file(MAX_LOGO_BYTES + 1))).toBe(
      `Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`
    );
  });
});
