import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlan } from "./use-plan";

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("usePlan", () => {
  beforeEach(() => {
    window.localStorage.clear();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upgrade returns true and flips isPro on a successful write", () => {
    const { result } = renderHook(() => usePlan());
    let ok: boolean | undefined;
    act(() => {
      ok = result.current.upgrade();
    });
    expect(ok).toBe(true);
    expect(result.current.isPro).toBe(true);
  });

  it("downgrade returns true and flips isPro back on a successful write", () => {
    const { result } = renderHook(() => usePlan());
    act(() => {
      result.current.upgrade();
    });
    let ok: boolean | undefined;
    act(() => {
      ok = result.current.downgrade();
    });
    expect(ok).toBe(true);
    expect(result.current.isPro).toBe(false);
  });

  it("upgrade returns false and leaves isPro false when the write fails (quota exceeded)", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    const { result } = renderHook(() => usePlan());
    let ok: boolean | undefined;
    act(() => {
      ok = result.current.upgrade();
    });
    expect(ok).toBe(false);
    expect(result.current.isPro).toBe(false);
  });
});
