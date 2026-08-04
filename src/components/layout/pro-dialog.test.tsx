import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProDialog } from "./pro-dialog";
import * as storage from "@/lib/storage";

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
    window.localStorage.clear();
    push.mockClear();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unlocks Pro, closes and navigates on a successful upgrade", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ProDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(toast).toHaveBeenCalledWith("Pro unlocked for this prototype");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/brands/create");
    expect(storage.getPlanSnapshot().tier).toBe("pro");
  });

  it("does not toast success, close or navigate when the upgrade write fails", async () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ProDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(toast).not.toHaveBeenCalledWith("Pro unlocked for this prototype");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
  });
});
