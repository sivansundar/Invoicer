import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Brand } from "./types";

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

const v1Brand = {
  id: "b1",
  name: "Sivan Studio",
  address: "44, 100 Feet Rd, Indiranagar, Bengaluru 560038",
  email: "billing@sivan.studio",
  invoicePrefix: "SC",
  nextInvoiceNumber: 15,
  createdAt: "2026-01-01T00:00:00.000Z",
  bankDetails: {
    accountName: "Sivan Studio",
    accountNumber: "50100234914210",
    bankName: "HDFC Bank",
    ifscCode: "HDFC0001234",
  },
};

describe("storage — runMigration cache invalidation", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    // The quarantine path (irrelevant here, but shared with migrate.test.ts)
    // calls console.warn by design — stub it so the run stays pristine.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Each test gets a fresh module instance, and therefore a fresh,
    // empty snapshot cache — otherwise a snapshot cached by an earlier
    // test in this file would leak into the next one.
    vi.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("drops a snapshot cached before migration so the next read reflects migrated data", async () => {
    const storage = await import("./storage");

    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));

    // Simulate a hook reading its snapshot during the same first render
    // that Shell's `useEffect(() => runMigration())` will run in — the
    // cache gets populated with pre-migration data before migration runs.
    const before = storage.getBrandsSnapshot();
    expect(before[0].accentColor).toBeUndefined();
    expect(before[0].followup).toBeUndefined();

    storage.runMigration();

    const after = storage.getBrandsSnapshot();
    expect(after).not.toBe(before);
    expect(after[0].accentColor).toBeDefined();
    expect(after[0].followup).toBeDefined();
    expect(after[0].followup.mode).toBe("weekly");
  });

  it("forceMigration drops a cached snapshot even when the version key is already current", async () => {
    const storage = await import("./storage");

    localStorage.setItem("invoicer_schema_version", "2");
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));

    // Same scenario as an import: the version key already matches, so a
    // plain `runMigration()` would no-op and this stale, pre-migration
    // snapshot would never get dropped.
    const before = storage.getBrandsSnapshot();
    expect(before[0].accentColor).toBeUndefined();

    storage.forceMigration();

    const after = storage.getBrandsSnapshot();
    expect(after).not.toBe(before);
    expect(after[0].accentColor).toBeDefined();
    expect(after[0].followup).toBeDefined();
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

  it("surfaces a QuotaExceededError as a toast instead of throwing", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => storage.saveBrand(fullBrand())).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
    // The failed write must not be treated as if it succeeded.
    expect(storage.getBrands()).toHaveLength(0);
  });

  it("surfaces the older Firefox quota error name the same way", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Persistent storage maxed out", "NS_ERROR_DOM_QUOTA_REACHED");
    });

    expect(() => storage.saveBrand(fullBrand())).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });

  it("still throws for an unrelated localStorage failure rather than mislabeling it", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("some unrelated failure");
    });

    expect(() => storage.saveBrand(fullBrand())).toThrow("some unrelated failure");
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
