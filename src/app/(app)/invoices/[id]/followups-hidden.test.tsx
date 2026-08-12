import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceDetailPage from "./page";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import type { Brand, Invoice } from "@/lib/types";

// Brands are in Postgres now; invoices are not yet. The fake mirrors both.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

// Deliberately does *not* mock "@/lib/features" — this exercises the real
// production default (FEATURES.followups: false) to prove the follow-ups
// card is actually hidden on the invoice detail page, complementing
// page.test.tsx (which turns the flag on to keep covering the handlers).

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "i1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/invoices/i1",
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "b1",
    name: "Sivan Studio",
    address: "44, 100 Feet Rd",
    email: "billing@sivan.studio",
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

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    invoiceNumber: "SC-2026-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme Studio", address: "12 Residency Rd" },
    items: [{ id: "li1", description: "Design work", amount: 40000, tax: 18 }],
    subtotal: 40000,
    totalTax: 7200,
    total: 47200,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    brandSnapshot: {
      name: "Sivan Studio",
      address: "44, 100 Feet Rd",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: ["2026-06-10"],
    followupsPaused: false,
    ...overrides,
  };
}

describe("InvoiceDetailPage with follow-ups hidden (default flag state)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render the follow-ups card even with reminder history", () => {
    seed({ brands: [brand()], invoices: [invoice()] });

    renderWithProviders(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    expect(screen.queryByText("Follow-ups")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause follow-ups" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send one now" })).not.toBeInTheDocument();
  });

  it("still renders status actions, dates and delete without the card", async () => {
    seed({ brands: [brand()], invoices: [invoice({ status: "sent" })] });

    renderWithProviders(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    // findBy, not getBy: the invoice is fetched, so nothing is on screen
    // until that query resolves.
    expect(await screen.findByRole("button", { name: "Mark as paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });
});
