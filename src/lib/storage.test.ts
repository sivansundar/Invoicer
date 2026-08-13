import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What is left of the localStorage seam.
 *
 * Brands, clients, templates and invoices all live in Postgres now — their
 * behaviour is covered by `src/test/integration/seam.test.ts` and
 * `rpc.test.ts` against a real database, and by
 * `src/lib/supabase/mappers.test.ts` for the row conversion.
 *
 * Plan state is the one thing still written locally, and stays that way by
 * design: it is a mock with no billing integration and no schema behind it.
 * That makes this file small, which is the point — the surface it guards is
 * small now too.
 *
 * The v1→v2 migration keeps its own coverage in `migrate.test.ts`. It no
 * longer feeds any screen; it survives because the localStorage importer
 * will reuse it to normalise a legacy backup.
 */

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("plan state", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips through localStorage", async () => {
    const storage = await import("./storage");

    expect(storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" })).toBe(true);

    expect(storage.getPlanSnapshot()).toEqual({ tier: "pro", renewsOn: "2026-08-27" });
  });

  it("defaults to the free tier when nothing is stored", async () => {
    const storage = await import("./storage");

    expect(storage.getPlanSnapshot()).toEqual({ tier: "free", renewsOn: null });
  });

  it("reads the default instead of throwing on an unparseable stored value", async () => {
    // `getPlanSnapshot` is `useSyncExternalStore`'s snapshot function for
    // `use-plan`, with no error boundary above it — an unguarded JSON.parse
    // here throws during render and white-screens every route, not just the
    // screen that reads the plan.
    localStorage.setItem("invoicer_plan", "{not valid json");
    const storage = await import("./storage");

    expect(() => storage.getPlanSnapshot()).not.toThrow();
    expect(storage.getPlanSnapshot()).toEqual({ tier: "free", renewsOn: null });
  });

  it("returns a stable snapshot reference, so useSyncExternalStore cannot loop", async () => {
    const storage = await import("./storage");
    storage.savePlan({ tier: "pro", renewsOn: null });

    // JSON.parse returns a fresh object every call; handing that straight to
    // useSyncExternalStore re-renders forever.
    expect(storage.getPlanSnapshot()).toBe(storage.getPlanSnapshot());
  });
});

describe("plan state — quota exceeded", () => {
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

    expect(() => storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" })).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
    // The failed write must not be reported as a success — `pro-dialog.tsx`
    // branches on this to avoid toasting "Pro unlocked" over a write that
    // never landed.
    expect(storage.savePlan({ tier: "pro", renewsOn: null })).toBe(false);
  });

  it("surfaces the older Firefox quota error name the same way", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Persistent storage maxed out", "NS_ERROR_DOM_QUOTA_REACHED");
    });

    expect(() => storage.savePlan({ tier: "pro", renewsOn: null })).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
  });

  it("still throws for an unrelated localStorage failure rather than mislabeling it", async () => {
    const storage = await import("./storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("some unrelated failure");
    });

    expect(() => storage.savePlan({ tier: "pro", renewsOn: null })).toThrow(
      "some unrelated failure"
    );
    expect(toast).not.toHaveBeenCalled();
  });
});
