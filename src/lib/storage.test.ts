import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
