import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Shell } from "@/components/layout/shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

/**
 * Shell is mounted once by `(app)/layout.tsx` rather than by each page.
 *
 * Before this, every page wrapped itself in `<Shell>`, so the sidebar, both
 * context providers and the query cache's subscribers were torn down and
 * rebuilt on every in-app navigation. This file guards both halves of the
 * fix: that no page re-introduces its own wrapper, and that Shell actually
 * survives a change of children.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Resolved from cwd rather than import.meta.url: under the jsdom
// environment that URL is an http: one, which fileURLToPath rejects.
const APP_DIR = join(process.cwd(), "src/app/(app)");

describe("Shell is owned by the layout, not by pages", () => {
  it("no page under (app)/ imports Shell", () => {
    const pages = readdirSync(APP_DIR, { recursive: true, encoding: "utf8" }).filter((entry) =>
      entry.endsWith("page.tsx")
    );

    // Sanity check on the glob itself: an empty list would make the
    // assertion below pass vacuously and silently stop guarding anything.
    expect(pages.length).toBeGreaterThan(10);

    const offenders = pages.filter((page) =>
      readFileSync(join(APP_DIR, page), "utf8").includes("@/components/layout/shell")
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the sidebar mounted when children change", () => {
    // ThemeProvider comes from the root layout, above (app)/layout.tsx —
    // SiteHeader's theme toggle throws without it.
    const tree = (children: React.ReactNode) => (
      <ThemeProvider>
        <QueryProvider>
          <Shell>{children}</Shell>
        </QueryProvider>
      </ThemeProvider>
    );

    const { container, rerender } = render(tree(<p>first route</p>));

    // The shadcn Sidebar root is a div, not a <nav>, so there is no
    // navigation role to query — data-slot is the attribute the component
    // itself sets and is what the library's own styles key off.
    const sidebarOf = () => container.querySelector('[data-slot="sidebar-container"]');

    const sidebarBefore = sidebarOf();
    expect(sidebarBefore).not.toBeNull();
    expect(screen.getByText("first route")).toBeInTheDocument();

    rerender(tree(<p>second route</p>));

    // Node identity, not just presence: a remount would produce an
    // equivalent-looking sidebar backed by a different DOM node, which is
    // exactly the regression this test exists to catch.
    expect(sidebarOf()).toBe(sidebarBefore);
    expect(screen.getByText("second route")).toBeInTheDocument();
    expect(screen.queryByText("first route")).not.toBeInTheDocument();
  });
});
