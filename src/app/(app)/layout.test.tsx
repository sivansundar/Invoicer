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

// Stubbed because this file tests the auth gate, not the chrome. The real
// Shell renders AppSidebar, which calls usePathname() — a hook the
// next/navigation mock above deliberately does not provide, since adding it
// would mean maintaining a growing stub of the router here for no gain. What
// matters to these tests is that children render at all; shell-rendering.test.tsx
// covers Shell being mounted by this layout rather than by each page.
vi.mock("@/components/layout/shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

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
