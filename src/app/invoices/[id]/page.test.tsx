import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceDetailPage from "./page";
import { ThemeProvider } from "@/components/theme/theme-provider";
import * as storage from "@/lib/storage";
import type { Brand, Invoice } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "i1" }),
  useRouter: () => ({ push }),
  usePathname: () => "/invoices/i1",
}));

// No `<Toaster />` is mounted in these tests, so a toast call never reaches
// the DOM — mock `toast` directly and assert on the call instead.
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

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
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Fully resets the storage module's snapshot cache (not just the
    // underlying localStorage mock) so no fixture from a previous test can
    // leak into this one — see runMigration's cache-clearing contract.
    storage.runMigration();
    push.mockClear();
    toast.mockClear();
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

  it("does not report success and leaves the status unchanged when marking paid fails", async () => {
    storage.saveBrand(brand());
    storage.saveInvoice(invoice({ status: "sent" }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Mark as paid" }));

    // No "in the bank" success toast — only storage.ts's own quota-failure
    // toast (asserted via the still-present "Mark as paid" button below).
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("in the bank"));
    // The status shown in the UI is still "sent" — the "Mark as paid" button
    // (only rendered for sent/overdue invoices) is still there, and the
    // stored record was never actually flipped to "paid".
    expect(screen.getByRole("button", { name: "Mark as paid" })).toBeInTheDocument();
    expect(storage.getInvoice("i1")?.status).toBe("sent");
  });
});
