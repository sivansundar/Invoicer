import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import ClientsPage from "./clients/page";
import BrandsPage from "./brands/page";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import EditBrandPage from "./brands/[id]/edit/page";
import EditClientPage from "./clients/[id]/edit/page";
import EditInvoicePage from "./invoices/[id]/edit/page";
import type { Brand, Client } from "@/lib/types";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "missing" }),
  usePathname: () => "/",
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

/**
 * Reads were synchronous before this phase, so every screen assumed its data
 * was already there. Two things that produces, and the second is worse:
 *
 * - A list shows its empty state while the query is still in flight, telling
 *   a user with fifty clients that they have none.
 * - A detail or edit screen shows "not found", which is not just unstyled —
 *   it is false, on the screen where a user is most likely to believe
 *   something has genuinely been lost.
 *
 * Both are only visible in the first frame, which is exactly why they need a
 * test rather than a look.
 */

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "b1",
    name: "Sivan Studio",
    address: "",
    email: "",
    invoicePrefix: "SC",
    nextInvoiceNumber: 1,
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: false,
      mode: "weekly",
      weekday: 1,
      time: "09:00",
      repeat: "week",
      templateId: "",
      stopAfter: 0,
    },
    invoiceDesign: "modern",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    companyName: "Acme Studio",
    address: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function skeletonCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-slot="skeleton"]').length;
}

beforeEach(() => {
  resetFakeSeam();
});

describe("lists do not flash an empty state before their data arrives", () => {
  it("/clients shows a skeleton first, never 'No clients yet'", async () => {
    seed({ clients: [client()] });

    const { container } = renderWithProviders(<ClientsPage />);

    // First frame: skeleton, and crucially not the empty-state copy.
    expect(skeletonCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText("No clients yet")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Acme Studio")).toBeInTheDocument());
    expect(skeletonCount(container)).toBe(0);
    expect(screen.queryByText("No clients yet")).not.toBeInTheDocument();
  });

  it("/clients still reaches the empty state when the account really is empty", async () => {
    // The guard must not swallow the real message — otherwise a genuinely
    // empty account shows a skeleton that resolves into nothing at all.
    const { container } = renderWithProviders(<ClientsPage />);

    await waitFor(() => expect(screen.getByText("No clients yet")).toBeInTheDocument());
    expect(skeletonCount(container)).toBe(0);
  });

  it("/brands shows a skeleton before the card grid", async () => {
    seed({ brands: [brand()] });

    // BrandFilterProvider normally comes from Shell, which (app)/layout.tsx
    // mounts above every page.
    const { container } = renderWithProviders(
      <BrandFilterProvider>
        <BrandsPage />
      </BrandFilterProvider>
    );

    expect(skeletonCount(container)).toBeGreaterThan(0);
    // The dashed "Add another brand" tile is the only thing an unguarded
    // grid would render, which reads as an empty account.
    expect(screen.queryByText("Add another brand")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Sivan Studio")).toBeInTheDocument());
  });
});

describe("edit screens do not claim a record is missing while loading it", () => {
  it.each([
    ["brand", EditBrandPage, "Brand not found."],
    ["client", EditClientPage, "Client not found."],
    ["invoice", EditInvoicePage, "Invoice not found."],
  ])("/%s edit shows a skeleton, not the not-found copy", async (_label, Page, notFound) => {
    const { container } = renderWithProviders(<Page />);

    expect(skeletonCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText(notFound)).not.toBeInTheDocument();

    // And once the query settles with no match, the honest message does
    // appear — the guard delays it rather than hiding it.
    await waitFor(() => expect(screen.getByText(notFound)).toBeInTheDocument());
  });
});
