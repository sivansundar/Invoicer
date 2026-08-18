import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import LoginPage from "./page";

// LoginForm reads `next` off the URL via useSearchParams(), which jsdom's
// bare test environment does not supply a router for.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const signInWithOtp = vi.fn();
const signInWithOAuth = vi.fn();

// The global mock in src/test/setup.ts only supplies getUser/signOut — this
// page needs signInWithOtp and signInWithOAuth, so it overrides with its own.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  }),
}));

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    signInWithOAuth.mockReset();
    toast.mockClear();
  });

  it("disables the Google button while the redirect is in flight", async () => {
    // signInWithOAuth resolves only once the redirect is arranged. Without a
    // pending state the button stays live, and a second click starts a
    // second OAuth flow.
    let resolve: () => void;
    signInWithOAuth.mockReturnValue(
      new Promise<{ error: null }>((r) => {
        resolve = () => r({ error: null });
      })
    );

    renderWithProviders(<LoginPage />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).not.toBeDisabled();

    await userEvent.click(button);

    expect(button).toBeDisabled();
    resolve!();
  });

  it("re-enables the Google button when signInWithOAuth errors", async () => {
    signInWithOAuth.mockResolvedValue({ error: { message: "boom" } });

    renderWithProviders(<LoginPage />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    await userEvent.click(button);

    expect(button).not.toBeDisabled();
    expect(toast).toHaveBeenCalledWith("boom");
  });
});
