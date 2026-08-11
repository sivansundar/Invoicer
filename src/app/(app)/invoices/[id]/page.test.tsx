import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// FEATURES.followups is off in production so the follow-ups card (and the
// "Pause follow-ups" / "Send one now" buttons the tests below exercise)
// doesn't render — see src/lib/features.ts. Turned on here so this file can
// keep covering the underlying handlers' write-failure behaviour; a
// dedicated test further down covers the default (flag-off) hidden state.
vi.mock("@/lib/features", () => ({ FEATURES: { billing: false, followups: true } }));

// No `<Toaster />` is mounted in these tests, so a toast call never reaches
// the DOM — mock `toast` directly and assert on the call instead.
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

// The page renders <Shell>, which renders <UserMenu>, which calls
// createClient() on mount — the real client requires Supabase env vars that
// aren't set in the unit test environment. Mock it out; these tests aren't
// exercising auth.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
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

  // Every test below spies on `window.localStorage.setItem` to force a
  // write failure — restoring after each test keeps that spy from leaking
  // into the next one and breaking its (unrelated) writes, e.g. the theme
  // provider's own `setItem` call on mount.
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(storage.getInvoices().find((i) => i.id === "i1")?.status).toBe("sent");
  });

  it("does not report success and leaves the status unchanged when marking sent fails", async () => {
    storage.saveBrand(brand());
    storage.saveInvoice(invoice({ status: "draft", dueDate: "2026-06-15" }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Mark as sent" }));

    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("marked as sent"));
    expect(screen.getByRole("button", { name: "Mark as sent" })).toBeInTheDocument();
    expect(storage.getInvoices().find((i) => i.id === "i1")?.status).toBe("draft");
  });

  it("does not report success and leaves the pause flag unchanged when toggling pause fails", async () => {
    storage.saveBrand(brand());
    storage.saveInvoice(invoice({ status: "sent", followupsPaused: false }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Pause follow-ups" }));

    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("Follow-ups paused"));
    // Still reads "Pause follow-ups" — a successful toggle would have flipped
    // the label to "Resume follow-ups".
    expect(screen.getByRole("button", { name: "Pause follow-ups" })).toBeInTheDocument();
    expect(storage.getInvoices().find((i) => i.id === "i1")?.followupsPaused).toBe(false);
  });

  it("does not report success and leaves reminder history unchanged when sending now fails", async () => {
    storage.saveBrand(brand());
    storage.saveInvoice(invoice({ status: "sent", reminders: [] }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await user.click(screen.getByRole("button", { name: "Send one now" }));

    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("sent to"));
    expect(storage.getInvoices().find((i) => i.id === "i1")?.reminders).toEqual([]);
  });

  it("does not navigate away or drop the record when deleting fails", async () => {
    storage.saveBrand(brand());
    storage.saveInvoice(invoice());

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <InvoiceDetailPage />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("deleted"));
    expect(push).not.toHaveBeenCalled();
    expect(storage.getInvoices().find((i) => i.id === "i1")).toBeDefined();
  });
});
