import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceForm } from "./invoice-form";
import * as storage from "@/lib/storage";
import type { Brand, Client, Invoice, InvoiceStatus } from "@/lib/types";

// jsdom implements neither the Pointer Capture API nor scrollIntoView, both
// of which Radix's Select uses internally when opened via a real pointer
// interaction — without these no-op polyfills every `userEvent.click` on a
// Select trigger throws in this environment.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    companyName: "Acme Studio",
    name: "Priya Nair",
    address: "12 Residency Rd",
    createdAt: "2026-01-01T00:00:00.000Z",
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
      name: "Old Brand Name",
      address: "44, 100 Feet Rd",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: "c1",
    reminders: ["2026-06-05", "2026-06-12"],
    followupsPaused: true,
    ...overrides,
  };
}

describe("InvoiceForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Fully resets the storage module's snapshot cache (not just the
    // underlying localStorage mock) so no fixture from a previous test can
    // leak into this one — see runMigration's cache-clearing contract.
    storage.runMigration();
    push.mockClear();
    toast.mockClear();
  });

  describe.each<InvoiceStatus>(["sent", "overdue", "paid"])(
    "editing a %s invoice",
    (status) => {
      it(`preserves "${status}" when the primary save button is clicked`, async () => {
        storage.saveBrand(brand({ name: "New Brand Name" }));
        storage.saveClient(client());
        const existing = invoice({ status });
        storage.saveInvoice(existing);

        const user = userEvent.setup();
        render(<InvoiceForm existingInvoice={existing} />);

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        const saved = storage.getInvoices().find((i) => i.id === "i1");
        expect(saved?.status).toBe(status);
      });
    }
  );

  it('"Save as draft" explicitly sets status to draft, even from paid', async () => {
    storage.saveBrand(brand());
    storage.saveClient(client());
    const existing = invoice({ status: "paid" });
    storage.saveInvoice(existing);

    const user = userEvent.setup();
    render(<InvoiceForm existingInvoice={existing} />);

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    const saved = storage.getInvoices().find((i) => i.id === "i1");
    expect(saved?.status).toBe("draft");
  });

  it("does not reset reminders, followupsPaused, or brandSnapshot when editing", async () => {
    // The brand record has since changed name — proves the saved invoice
    // keeps its originally frozen snapshot rather than re-deriving it.
    storage.saveBrand(brand({ name: "New Brand Name" }));
    storage.saveClient(client());
    const existing = invoice({
      status: "sent",
      reminders: ["2026-06-05", "2026-06-12"],
      followupsPaused: true,
    });
    storage.saveInvoice(existing);

    const user = userEvent.setup();
    render(<InvoiceForm existingInvoice={existing} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const saved = storage.getInvoices().find((i) => i.id === "i1");
    expect(saved?.reminders).toEqual(["2026-06-05", "2026-06-12"]);
    expect(saved?.followupsPaused).toBe(true);
    expect(saved?.brandSnapshot.name).toBe("Old Brand Name");
  });

  it("a new invoice starts \"sent\" via the primary button", async () => {
    storage.saveBrand(brand());
    storage.saveClient(client());

    const user = userEvent.setup();
    render(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    const amountInput = row.querySelectorAll("input")[1];
    await user.type(amountInput, "5000");

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    expect(push).toHaveBeenCalledWith("/");
    const saved = storage.getInvoices()[0];
    expect(saved.status).toBe("sent");
  });

  it('a new invoice starts "draft" via the secondary button', async () => {
    storage.saveBrand(brand());
    storage.saveClient(client());

    const user = userEvent.setup();
    render(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(push).toHaveBeenCalledWith("/");
    const saved = storage.getInvoices()[0];
    expect(saved.status).toBe("draft");
  });

  it('saves with clientId: null and a typed client snapshot when "Enter manually…" is used', async () => {
    storage.saveBrand(brand());
    // A saved client also exists, to prove manual entry is additive rather
    // than replacing the select.
    storage.saveClient(client());

    const user = userEvent.setup();
    render(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Enter manually…" }));

    await user.type(screen.getByPlaceholderText("Acme Corp"), "One-off Client Ltd");
    const gstField = screen.getByText("GST Number").parentElement!.querySelector("input")!;
    await user.type(gstField, "29ABCDE1234F1Z5");
    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    await user.type(row.querySelectorAll("input")[1], "5000");

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    const saved = storage.getInvoices()[0];
    expect(saved.clientId).toBeNull();
    expect(saved.client.companyName).toBe("One-off Client Ltd");
    // The GSTIN is what lets a registered client claim input tax credit on an
    // Indian B2B invoice — it must round-trip through manual entry exactly
    // like it does through the saved-client path.
    expect(saved.client.gstNumber).toBe("29ABCDE1234F1Z5");
  });

  it('toasts and does not save when "Save as draft" is clicked with no brand selected', async () => {
    // No brand saved at all — the "Save as draft" button has no `disabled`
    // guard, unlike the primary button, so this used to hit an early
    // `return` with no feedback whatsoever.
    const user = userEvent.setup();
    render(<InvoiceForm />);

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(toast).toHaveBeenCalledWith("Select a brand first");
    expect(push).not.toHaveBeenCalled();
    expect(storage.getInvoices()).toHaveLength(0);
  });

  it("does not show the success toast or navigate away when the save itself fails", async () => {
    // Regression coverage for the same false-success gap fix round 2 closed
    // in brand-form.tsx: a full `localStorage` quota must not be reported as
    // a successful save. `storage.ts` toasts its own "Storage is full…"
    // failure message; `InvoiceForm` must neither toast its own success copy
    // on top of that nor navigate away from the unsaved invoice.
    storage.saveBrand(brand());
    storage.saveClient(client());

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    const user = userEvent.setup();
    render(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    const amountInput = row.querySelectorAll("input")[1];
    await user.type(amountInput, "5000");

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Storage is full"));
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("sent to"));
    expect(push).not.toHaveBeenCalled();
    expect(storage.getInvoices()).toHaveLength(0);
  });
});
