import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Brand } from "./types";

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("storage — server-backed brands", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a save in getBrands immediately and resolves true", async () => {
    const storage = await import("./storage");
    storage.hydrate({ brands: [], clients: [], invoices: [] });

    const pending = storage.saveBrand(fullBrand());
    expect(storage.getBrands()).toHaveLength(1);
    expect(await pending).toBe(true);
    expect(storage.getBrands()).toHaveLength(1);
  });
});

function fullBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "b1",
    name: "Sivan Studio",
    address: "44, 100 Feet Rd",
    email: "billing@sivan.studio",
    invoicePrefix: "SC",
    nextInvoiceNumber: 1,
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: false,
      mode: "weekly",
      weekday: 1,
      time: "09:00",
      repeat: "week",
      templateId: "",
      stopAfter: 0,
    },
    invoiceDesign: "modern",
    ...overrides,
  };
}

describe("storage — corrupt stored value", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  // getSnapshot (useSyncExternalStore's snapshot function) reads straight
  // through getItem with no error boundary anywhere above it — an unguarded
  // JSON.parse or missing Array.isArray check here throws during render and
  // white-screens every route, not just the screen that touches this key.
  it("reads an empty array instead of throwing for unparseable JSON", async () => {
    localStorage.setItem("invoicer_brands", "{not valid json");
    const storage = await import("./storage");
    expect(() => storage.getBrands()).not.toThrow();
    expect(storage.getBrands()).toEqual([]);
    expect(() => storage.getBrandsSnapshot()).not.toThrow();
    expect(storage.getBrandsSnapshot()).toEqual([]);
  });

  it("reads an empty array instead of throwing for valid JSON that isn't an array", async () => {
    localStorage.setItem("invoicer_invoices", JSON.stringify({ not: "an array" }));
    const storage = await import("./storage");
    expect(() => storage.getInvoices()).not.toThrow();
    expect(storage.getInvoices()).toEqual([]);
  });
});

describe("storage — quota exceeded", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failWrites(storage: typeof import("./storage")) {
    storage.hydrate({ brands: [], clients: [], invoices: [] });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
  }

  it("surfaces a QuotaExceededError as a toast and removes a refused new record", async () => {
    const storage = await import("./storage");
    failWrites(storage);

    expect(await storage.saveBrand(fullBrand())).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
    // The failed write must not be treated as if it succeeded.
    expect(storage.getBrands()).toHaveLength(0);
  });

  it("restores an edited record to its previous value when the save is refused", async () => {
    const storage = await import("./storage");
    storage.hydrate({ brands: [fullBrand()], clients: [], invoices: [] });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(await storage.saveBrand(fullBrand({ name: "Renamed" }))).toBe(false);
    expect(storage.getBrand("b1")?.name).toBe("Sivan Studio");
  });

  it("puts a record back when its delete is refused", async () => {
    const storage = await import("./storage");
    storage.hydrate({ brands: [fullBrand()], clients: [], invoices: [] });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(await storage.deleteBrand("b1")).toBe(false);
    expect(storage.getBrands()).toHaveLength(1);
  });

  it("surfaces the older Firefox quota error name the same way", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Persistent storage maxed out", "NS_ERROR_DOM_QUOTA_REACHED");
    });

    expect(await storage.saveBrand(fullBrand())).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });

  it("still throws for an unrelated localStorage failure rather than mislabeling it", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("some unrelated failure");
    });

    await expect(storage.saveBrand(fullBrand())).rejects.toThrow("some unrelated failure");
    expect(toast).not.toHaveBeenCalled();
  });

  it("guards the plan write through the same path", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" })).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });
});
