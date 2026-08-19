import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlan } from "./use-plan";

/**
 * The plan moved from `localStorage` to `org_billing`, so these no longer
 * assert a synchronous boolean write. The properties that matter now are
 * different ones: the tier comes from the server, upgrading goes through a
 * route rather than a client write, and a failed upgrade must not leave the
 * UI claiming Pro.
 */

const getPlan = vi.fn();
const getEmailQuota = vi.fn();
const setPlanTier = vi.fn();
const clearLegacyPlanKey = vi.fn();

vi.mock("@/lib/storage", () => ({
  getPlan: () => getPlan(),
  getEmailQuota: () => getEmailQuota(),
  setPlanTier: (tier: string) => setPlanTier(tier),
  clearLegacyPlanKey: () => clearLegacyPlanKey(),
}));

function wrapperFor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("usePlan", () => {
  beforeEach(() => {
    getPlan.mockResolvedValue({ tier: "free", renewsOn: null });
    getEmailQuota.mockResolvedValue({
      tier: "free",
      tierLabel: "Free",
      monthlyLimit: 100,
      used: 12,
      remaining: 88,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      overLimit: false,
    });
    setPlanTier.mockReset();
    clearLegacyPlanKey.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the tier from the server", async () => {
    getPlan.mockResolvedValue({ tier: "pro", renewsOn: "2026-09-18" });
    const { result } = renderHook(() => usePlan(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.isPro).toBe(true));
    expect(result.current.plan.renewsOn).toBe("2026-09-18");
  });

  it("reports the email allowance alongside the tier", async () => {
    const { result } = renderHook(() => usePlan(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.quota).not.toBeNull());
    expect(result.current.quota).toMatchObject({ used: 12, remaining: 88, monthlyLimit: 100 });
  });

  // A workspace with no billing row renders as free rather than blanking the
  // sidebar. The quota takes the opposite view and refuses to send, because
  // the safe direction differs.
  it("falls back to free before the query resolves", () => {
    const { result } = renderHook(() => usePlan(), { wrapper: wrapperFor() });
    expect(result.current.plan).toEqual({ tier: "free", renewsOn: null });
    expect(result.current.isPro).toBe(false);
  });

  it("upgrades through the server and reflects what came back", async () => {
    setPlanTier.mockResolvedValue({ tier: "pro", renewsOn: "2026-09-18" });
    const { result } = renderHook(() => usePlan(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.upgrade();
    expect(setPlanTier).toHaveBeenCalledWith("pro");
    await waitFor(() => expect(result.current.isPro).toBe(true));
  });

  /**
   * The property the old quota-exceeded test was really guarding: a failed
   * upgrade must not leave the UI claiming Pro. The failure mode moved from a
   * full disk to a rejected request; the requirement did not.
   */
  it("rejects and stays on the old tier when the server refuses", async () => {
    setPlanTier.mockRejectedValue(new Error("Payment required"));
    const { result } = renderHook(() => usePlan(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.upgrade()).rejects.toThrow("Payment required");
    expect(result.current.isPro).toBe(false);
  });

  it("clears the key the localStorage version left behind", async () => {
    renderHook(() => usePlan(), { wrapper: wrapperFor() });
    await waitFor(() => expect(clearLegacyPlanKey).toHaveBeenCalled());
  });
});
