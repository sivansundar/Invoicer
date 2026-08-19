import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProDialog } from "./pro-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getPlan = vi.fn();
const getEmailQuota = vi.fn();
const setPlanTier = vi.fn();
vi.mock("@/lib/storage", () => ({
  getPlan: () => getPlan(),
  getEmailQuota: () => getEmailQuota(),
  setPlanTier: (tier: string) => setPlanTier(tier),
  clearLegacyPlanKey: () => {},
}));

/** The dialog reads the plan through usePlan, which needs a query client. */
function renderDialog(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("ProDialog", () => {
  beforeEach(() => {
    getPlan.mockResolvedValue({ tier: "free", renewsOn: null });
    getEmailQuota.mockResolvedValue(null);
    setPlanTier.mockReset();
    setPlanTier.mockResolvedValue({ tier: "pro", renewsOn: null });
    push.mockClear();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unlocks Pro, closes and navigates on a successful upgrade", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(<ProDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(toast).toHaveBeenCalledWith("Pro unlocked for this prototype");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/brands/create");
    expect(setPlanTier).toHaveBeenCalledWith("pro");
  });

  // The failure mode moved from a full disk to a rejected request when the
  // tier moved to the server. The requirement did not: a failed upgrade must
  // not claim Pro is unlocked and walk the user off to create a brand.
  it("does not toast success, close or navigate when the upgrade is refused", async () => {
    setPlanTier.mockRejectedValue(new Error("Payment required"));

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(<ProDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(toast).not.toHaveBeenCalledWith("Pro unlocked for this prototype");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
  });
});
