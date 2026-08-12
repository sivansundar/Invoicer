import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "./types";

/**
 * What remains of the localStorage seam.
 *
 * Brands, clients and templates moved to Postgres — their behaviour is
 * covered by `src/test/integration/seam.test.ts` against a real database,
 * and by `src/lib/supabase/mappers.test.ts` for the row conversion. What is
 * still local, and still tested here, is invoices (until they move) and plan
 * state (which stays local by design — it is a mock with no schema).
 */

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

/** A pre-v2 invoice: no brandSnapshot, no reminders, no followupsPaused. */
const v1Invoice = {
  id: "i1",
  invoiceNumber: "SC2026001",
  brandId: "b1",
  currency: "INR",
  status: "sent",
  billDate: "2026-06-01",
  dueDate: "2026-06-15",
  client: { companyName: "Acme Studio", address: "12 Residency Rd" },
  items: [{ id: "li1", description: "Design work", amount: 40000, tax: 18 }],
  subtotal: 40000,
  totalTax: 7200,
  total: 47200,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function fullInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    ...(v1Invoice as unknown as Invoice),
    brandSnapshot: {
      name: "Sivan Studio",
      address: "44, 100 Feet Rd",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("storage — runMigration cache invalidation", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    // The quarantine path (irrelevant here, but shared with migrate.test.ts)
    // calls console.warn by design — stub it so the run stays pristine.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Each test gets a fresh module instance, and therefore a fresh, empty
    // snapshot cache — otherwise a snapshot cached by an earlier test in
    // this file would leak into the next one.
    vi.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("drops a snapshot cached before migration so the next read reflects migrated data", async () => {
    const storage = await import("./storage");

    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));

    // Simulate a hook reading its snapshot during the same first render that
    // Shell's `useEffect(() => runMigration())` will run in — the cache gets
    // populated with pre-migration data before migration runs.
    const before = storage.getInvoicesSnapshot();
    expect(before[0].reminders).toBeUndefined();
    expect(before[0].brandSnapshot).toBeUndefined();

    storage.runMigration();

    const after = storage.getInvoicesSnapshot();
    expect(after).not.toBe(before);
    expect(after[0].reminders).toEqual([]);
    expect(after[0].brandSnapshot).toBeDefined();
    expect(after[0].followupsPaused).toBe(false);
  });

  it("forceMigration drops a cached snapshot even when the version key is already current", async () => {
    const storage = await import("./storage");

    localStorage.setItem("invoicer_schema_version", "2");
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));

    // Same scenario as an import: the version key already matches, so a plain
    // `runMigration()` would no-op and this stale, pre-migration snapshot
    // would never get dropped.
    const before = storage.getInvoicesSnapshot();
    expect(before[0].reminders).toBeUndefined();

    storage.forceMigration();

    const after = storage.getInvoicesSnapshot();
    expect(after).not.toBe(before);
    expect(after[0].reminders).toEqual([]);
    expect(after[0].brandSnapshot).toBeDefined();
  });
});

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
    localStorage.setItem("invoicer_invoices", "{not valid json");
    const storage = await import("./storage");

    expect(() => storage.getInvoices()).not.toThrow();
    expect(storage.getInvoices()).toEqual([]);
    expect(() => storage.getInvoicesSnapshot()).not.toThrow();
    expect(storage.getInvoicesSnapshot()).toEqual([]);
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

    expect(() => storage.saveInvoice(fullInvoice())).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
    // The failed write must not be treated as if it succeeded.
    expect(storage.saveInvoice(fullInvoice())).toBe(false);
    expect(storage.getInvoices()).toHaveLength(0);
  });

  it("surfaces the older Firefox quota error name the same way", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Persistent storage maxed out", "NS_ERROR_DOM_QUOTA_REACHED");
    });

    expect(() => storage.saveInvoice(fullInvoice())).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });

  it("still throws for an unrelated localStorage failure rather than mislabeling it", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("some unrelated failure");
    });

    expect(() => storage.saveInvoice(fullInvoice())).toThrow("some unrelated failure");
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
