import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What is left of the localStorage seam.
 *
 * Almost nothing, now. Brands, clients, templates and invoices live in
 * Postgres — covered by `src/test/integration/seam.test.ts` and `rpc.test.ts`
 * against a real database, and by `src/lib/supabase/mappers.test.ts` for the
 * row conversion. Plan state was the last holdout and moved to `org_billing`
 * once the email quota began depending on it: a tier a browser can write is a
 * tier every browser can grant itself.
 *
 * The plan tests that used to live here were deleted rather than adapted —
 * they asserted a round-trip through `localStorage` that no longer happens,
 * and a snapshot-identity property that mattered only to
 * `useSyncExternalStore`, which `use-plan` no longer uses. What survives is
 * the quota-exceeded path, which is still live: `writeLocalStorage` backs the
 * setup card's dismissal. It is tested here directly rather than through the
 * plan writer that used to reach it.
 *
 * The v1→v2 migration keeps its own coverage in `migrate.test.ts`.
 */

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("writeLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes and reports success", async () => {
    const { writeLocalStorage } = await import("./local-storage");
    expect(writeLocalStorage("k", "v")).toBe(true);
    expect(localStorage.getItem("k")).toBe("v");
  });

  /**
   * A full disk must not throw out of a click handler. It must also not
   * report success: callers branch on the return value to avoid telling
   * somebody a change was saved when it was not.
   */
  it("surfaces a QuotaExceededError as a toast instead of throwing", async () => {
    const { writeLocalStorage } = await import("./local-storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    let result: boolean | undefined;
    expect(() => {
      result = writeLocalStorage("k", "v");
    }).not.toThrow();
    expect(result).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });
});

describe("clearLegacyPlanKey", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A stale entry claiming Pro would sit in browsers forever meaning nothing,
  // and mislead the next person who opens devtools wondering why a tier looks
  // wrong.
  it("removes the key the localStorage plan left behind", async () => {
    localStorage.setItem("invoicer_plan", '{"tier":"pro","renewsOn":null}');
    const storage = await import("./storage");
    storage.clearLegacyPlanKey();
    expect(localStorage.getItem("invoicer_plan")).toBeNull();
  });

  it("does not throw when localStorage is unavailable", async () => {
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const storage = await import("./storage");
    expect(() => storage.clearLegacyPlanKey()).not.toThrow();
  });
});
