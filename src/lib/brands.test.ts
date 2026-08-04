import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  brandDeleteGuard,
  computeDownsampleDimensions,
  dataUrlByteSize,
  derivePrefix,
  downsampleImage,
  invoiceUsageLabel,
  LOGO_MAX_DIMENSION,
  MAX_LOGO_SOURCE_BYTES,
  MAX_LOGO_STORED_BYTES,
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

  it("accepts a file right at the source size limit", () => {
    expect(validateLogoFile(file(MAX_LOGO_SOURCE_BYTES))).toBeNull();
  });

  it("rejects a non-image file", () => {
    expect(validateLogoFile(file(1024, "application/pdf"))).toBe("Logo must be an image file");
  });

  it("rejects a file over the source size limit", () => {
    expect(validateLogoFile(file(MAX_LOGO_SOURCE_BYTES + 1))).toBe(
      `Logo must be under ${Math.round(MAX_LOGO_SOURCE_BYTES / (1024 * 1024))}MB`
    );
  });
});

describe("computeDownsampleDimensions", () => {
  it("does not upscale an image already within bounds", () => {
    expect(computeDownsampleDimensions(100, 50, LOGO_MAX_DIMENSION)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("leaves an image exactly at the bound unchanged", () => {
    expect(computeDownsampleDimensions(256, 256, 256)).toEqual({ width: 256, height: 256 });
  });

  it("scales a wide image down, preserving aspect ratio", () => {
    expect(computeDownsampleDimensions(2000, 1000, 256)).toEqual({ width: 256, height: 128 });
  });

  it("scales a tall image down by its longer edge, preserving aspect ratio", () => {
    expect(computeDownsampleDimensions(1000, 2000, 256)).toEqual({ width: 128, height: 256 });
  });
});

describe("dataUrlByteSize", () => {
  it("matches the byte length of a plain (unpadded) base64 payload", () => {
    // "abc" -> "YWJj" (4 base64 chars, 0 padding, decodes to exactly 3 bytes)
    expect(dataUrlByteSize("data:text/plain;base64,YWJj")).toBe(3);
  });

  it("accounts for base64 padding", () => {
    // "ab" -> "YWI=" (1 padding char, decodes to 2 bytes)
    expect(dataUrlByteSize("data:text/plain;base64,YWI=")).toBe(2);
  });
});

describe("downsampleImage", () => {
  // jsdom does not implement an image decoder — a real `<img src="data:...">`
  // never fires `onload` and `naturalWidth`/`naturalHeight` stay 0 (verified
  // directly against this environment before writing these tests), and
  // `HTMLCanvasElement#getContext` returns `null` without the optional
  // `canvas` npm package, which this project does not depend on. Real
  // pixel-drawing/encoding correctness is therefore *not* provable by a unit
  // test here — it's covered by the browser check in the fix report instead.
  // What *is* tested below, by mocking `Image` and the canvas prototype
  // methods: that `downsampleImage` computes the right target dimensions
  // from a decoded image's size (exercising `computeDownsampleDimensions`
  // through the real integration point), doesn't upscale a small source,
  // and enforces `MAX_LOGO_STORED_BYTES` against whatever `toDataURL`
  // returns.
  const realImage = global.Image;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
  let lastDrawImageArgs: unknown[] | null = null;
  let toDataURLResult = "data:image/png;base64,AAAA";

  class MockImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      // Fires synchronously — real decoding is async, but nothing here
      // depends on ordering relative to other microtasks.
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    lastDrawImageArgs = null;
    toDataURLResult = "data:image/png;base64,AAAA";
    // @ts-expect-error -- test double, not a full Image implementation
    global.Image = MockImage;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: (...args: unknown[]) => {
        lastDrawImageArgs = args;
      },
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => toDataURLResult);
  });

  afterEach(() => {
    global.Image = realImage;
    HTMLCanvasElement.prototype.getContext = realGetContext;
    HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  });

  function pngFile(bytes = 16): File {
    return new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" });
  }

  it("downsamples a large image to the bounded dimensions", async () => {
    const OriginalMockImage = global.Image as unknown as typeof MockImage;
    // @ts-expect-error -- augmenting the mock with the dimensions this case needs
    global.Image = class extends OriginalMockImage {
      constructor() {
        super();
        this.naturalWidth = 2000;
        this.naturalHeight = 1000;
      }
    };

    const result = await downsampleImage(pngFile(), 256);

    expect(result).toBe(toDataURLResult);
    expect(lastDrawImageArgs?.slice(1)).toEqual([0, 0, 256, 128]);
  });

  it("does not upscale a source already smaller than the bound", async () => {
    const OriginalMockImage = global.Image as unknown as typeof MockImage;
    // @ts-expect-error -- augmenting the mock with the dimensions this case needs
    global.Image = class extends OriginalMockImage {
      constructor() {
        super();
        this.naturalWidth = 40;
        this.naturalHeight = 20;
      }
    };

    await downsampleImage(pngFile(), 256);

    expect(lastDrawImageArgs?.slice(1)).toEqual([0, 0, 40, 20]);
  });

  it("rejects loudly when the downsampled result is still over the stored-size cap", async () => {
    // One byte over the cap, encoded as base64 (4 chars per 3 bytes).
    const oversizedBytes = MAX_LOGO_STORED_BYTES + 1;
    toDataURLResult = `data:image/png;base64,${"A".repeat(Math.ceil((oversizedBytes * 4) / 3))}`;

    await expect(downsampleImage(pngFile(), 256)).rejects.toThrow(
      "Logo is still too large after resizing — try a simpler image"
    );
  });

  it("rejects when the image fails to decode", async () => {
    class FailingImage extends MockImage {
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    // @ts-expect-error -- test double, not a full Image implementation
    global.Image = FailingImage;

    await expect(downsampleImage(pngFile(), 256)).rejects.toThrow(
      "Logo file could not be read"
    );
  });
});
