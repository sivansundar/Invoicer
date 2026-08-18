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
import InvoiceDetailPage from "./invoices/[id]/page";
import type { Brand, Client, Invoice } from "@/lib/types";

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

// `id: "missing"` on purpose — it matches the file-wide `useParams` mock
// above (`{ id: "missing" }`), so this fixture is the one InvoiceDetailPage
// actually finds without needing a per-test override of that mock.
function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "missing",
    invoiceNumber: "INV-2026-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme Studio", address: "" },
    items: [{ id: "li1", description: "Design work", amount: 40000, tax: 18 }],
    subtotal: 40000,
    totalTax: 7200,
    total: 47200,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    brandSnapshot: {
      name: "Sivan Studio",
      address: "",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
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

describe("detail and edit screens do not claim a record is missing while loading it", () => {
  it("/invoices/[id] shows a skeleton first, never 'not found'", async () => {
    seed({ brands: [brand()], clients: [client()], invoices: [invoice()] });

    const { container } = renderWithProviders(<InvoiceDetailPage />);

    // The first frame is the one that matters: a detail screen claiming the
    // record is gone is not merely unstyled, it is false, on the screen
    // where a user is most likely to believe something was lost.
    expect(skeletonCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();

    // Scoped to the heading: the invoice number also appears in the
    // client-facing preview pane, so a bare `getByText` matches twice.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "INV-2026-001" })).toBeInTheDocument()
    );
  });

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
