import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme utilities", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
  });

  it("reads a stored light theme preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    expect(getStoredTheme()).toBe("light");
  });

  it("defaults to dark when nothing is stored and dark mode is preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to light when storage is empty and dark mode is not preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    expect(resolveInitialTheme()).toBe("light");
  });

  it("applies light theme by removing the dark class and setting a data attribute", () => {
    document.documentElement.classList.add("dark");

    applyTheme("light");

    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
