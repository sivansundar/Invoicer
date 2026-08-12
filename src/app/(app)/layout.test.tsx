import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the defence-in-depth check `(app)/layout.tsx` runs behind
 * proxy.ts — see the comment on `AppLayout` for why this exists as a
 * separate check from the proxy's. The proxy has its own unit tests
 * (proxy.test.ts); this file is the one for the layer that runs "in the
 * same place the data does".
 */
const getUser = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({ redirect }));

const { default: AppLayout } = await import("./layout");

describe("(app)/layout — auth guard", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("redirects to /login when getUser() returns no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      AppLayout({ children: <div>secret content</div> })
    ).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when getUser() errors", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("boom") });

    await expect(
      AppLayout({ children: <div>secret content</div> })
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("renders children when a user is present", async () => {
    getUser.mockResolvedValue({
      data: { user: { email: "owner@example.com" } },
      error: null,
    });

    const element = await AppLayout({ children: <div>secret content</div> });
    render(element);

    expect(screen.getByText("secret content")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
