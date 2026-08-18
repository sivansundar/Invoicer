import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceForm } from "./invoice-form";
import { renderWithProviders } from "@/test/render";
import { failNext, resetFakeSeam, seed } from "@/test/fake-seam";
import * as storage from "@/lib/storage";
import type { Brand, Client, Invoice, InvoiceStatus } from "@/lib/types";

// Brands and clients are in Postgres now; invoices are not yet.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

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
      invoiceDesign: "modern",
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
    resetFakeSeam();
    push.mockClear();
    toast.mockClear();
  });

  describe.each<InvoiceStatus>(["sent", "overdue", "paid"])(
    "editing a %s invoice",
    (status) => {
      it(`preserves "${status}" when the primary save button is clicked`, async () => {
        seed({ brands: [brand({ name: "New Brand Name" })], clients: [client()] });
        const existing = invoice({ status });
        seed({ invoices: [existing] });

        const user = userEvent.setup();
        renderWithProviders(<InvoiceForm existingInvoice={existing} />);

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(push).toHaveBeenCalledWith("/dashboard");
        const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
        expect(saved?.status).toBe(status);
      });
    }
  );

  it('"Save as draft" explicitly sets status to draft, even from paid', async () => {
    seed({ brands: [brand()], clients: [client()] });
    const existing = invoice({ status: "paid" });
    seed({ invoices: [existing] });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm existingInvoice={existing} />);

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
    expect(saved?.status).toBe("draft");
  });

  it("does not reset reminders, followupsPaused, or brandSnapshot when editing", async () => {
    // The brand record has since changed name — proves the saved invoice
    // keeps its originally frozen snapshot rather than re-deriving it.
    seed({ brands: [brand({ name: "New Brand Name" })], clients: [client()] });
    const existing = invoice({
      status: "sent",
      reminders: ["2026-06-05", "2026-06-12"],
      followupsPaused: true,
    });
    seed({ invoices: [existing] });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm existingInvoice={existing} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
    expect(saved?.reminders).toEqual(["2026-06-05", "2026-06-12"]);
    expect(saved?.followupsPaused).toBe(true);
    expect(saved?.brandSnapshot.name).toBe("Old Brand Name");
  });

  it("a new invoice starts \"sent\" via the primary button", async () => {
    seed({ brands: [brand()], clients: [client()] });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Acme Studio" }));

    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    const amountInput = row.querySelectorAll("input")[1];
    await user.type(amountInput, "5000");
    fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
      target: { value: "2026-07-20" },
    });

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    expect(push).toHaveBeenCalledWith("/dashboard");
    const saved = (await storage.getInvoices())[0];
    expect(saved.status).toBe("sent");
  });

  it('a new invoice starts "draft" via the secondary button', async () => {
    seed({ brands: [brand()], clients: [client()] });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(push).toHaveBeenCalledWith("/dashboard");
    const saved = (await storage.getInvoices())[0];
    expect(saved.status).toBe("draft");
  });

  it('saves with clientId: null and a typed client snapshot when "Enter manually…" is used', async () => {
    seed({ brands: [brand()], clients: [client()] });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Enter manually…" }));

    await user.type(screen.getByPlaceholderText("Acme Corp"), "One-off Client Ltd");
    // Address is mandatory for "Create invoice" too, same as company name —
    // manual entry is not a way around that. Contact name is not, but it's
    // typed here anyway so the round-trip below covers a populated one.
    await user.type(screen.getByPlaceholderText("Optional — e.g. Priya Nair"), "Jordan Lee");
    const addressField = document.getElementById("field-address")!.querySelector("textarea")!;
    await user.type(addressField, "1 High St");
    const gstField = screen.getByText("GST Number").parentElement!.querySelector("input")!;
    await user.type(gstField, "29ABCDE1234F1Z5");
    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    await user.type(row.querySelectorAll("input")[1], "5000");
    fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
      target: { value: "2026-07-20" },
    });

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    const saved = (await storage.getInvoices())[0];
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
    renderWithProviders(<InvoiceForm />);

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(toast).toHaveBeenCalledWith("Select a brand first");
    expect(push).not.toHaveBeenCalled();
    expect((await storage.getInvoices())).toHaveLength(0);
  });

  it("does not show the success toast or navigate away when the save itself fails", async () => {
    // Regression coverage for the same false-success gap fix round 2 closed
    // in brand-form.tsx: a failed write must not be reported as a successful
    // save. Invoices are still localStorage-backed, so `storage.ts` toasts
    // its own "Storage is full…" message; `InvoiceForm` must neither toast
    // its own success copy on top of that nor navigate away from the unsaved
    // invoice. Armed through the fake rather than by spying on
    // localStorage.setItem, which the brand/client fixtures no longer touch.
    seed({ brands: [brand()], clients: [client()] });
    // createInvoice, not saveInvoice: a new invoice goes through the create
    // RPC, which is what allocates its number.
    failNext("createInvoice", "network unreachable");

    const user = userEvent.setup();
    renderWithProviders(<InvoiceForm />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Acme Studio" }));
    fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
      target: { value: "2026-07-20" },
    });

    const descriptionInput = screen.getByPlaceholderText("What did you do?");
    await user.type(descriptionInput, "Website redesign");
    const row = descriptionInput.parentElement as HTMLElement;
    const amountInput = row.querySelectorAll("input")[1];
    await user.type(amountInput, "5000");

    await user.click(screen.getByRole("button", { name: "Create invoice" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith("network unreachable"));
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("sent to"));
    expect(push).not.toHaveBeenCalled();
    expect((await storage.getInvoices())).toHaveLength(0);
  });

  describe("mandatory-field validation on save (create and edit, identically)", () => {
    it("toasts, highlights every missing field, and scrolls to the first one in form order", async () => {
      // "Create invoice" is disabled with no brand at all, so the earliest
      // this can actually be exercised is right after a brand is chosen —
      // everything after it (Billed to, dates, line items) is still empty.
      seed({ brands: [brand()] });
      const scrollIntoView = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {});

      const user = userEvent.setup();
      renderWithProviders(<InvoiceForm />);

      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

      const createButton = screen.getByRole("button", { name: "Create invoice" });
      expect(createButton).not.toBeDisabled();
      // Radix's Select internally calls `scrollIntoView` too (e.g. scrolling
      // an open dropdown's items into view) — clear those out so only the
      // validation's own call is observed below.
      scrollIntoView.mockClear();
      await user.click(createButton);

      // "Billed to" is the first thing still missing once a brand is picked.
      expect(toast).toHaveBeenCalledWith(
        "Who's this invoice for? Choose a client or enter one manually — a few other required fields need it too"
      );
      expect(push).not.toHaveBeenCalled();
      expect((await storage.getInvoices())).toHaveLength(0);

      const clientTrigger = document
        .getElementById("field-client")!
        .querySelector('[role="combobox"]')!;
      expect(clientTrigger).toHaveAttribute("aria-invalid", "true");
      const dueDateInput = document.getElementById("field-due-date")!.querySelector("input")!;
      expect(dueDateInput).toHaveAttribute("aria-invalid", "true");
      expect(document.getElementById("field-line-items")).toHaveTextContent(
        "Add at least one line item with a description and an amount"
      );

      expect(scrollIntoView).toHaveBeenCalled();
      // `field-client` is first in form order among what's actually missing
      // (brand is already filled) — confirms the scroll target tracks visual
      // order, not whatever order the checks happened to run in.
      expect(document.getElementById("field-client")!.contains(scrollIntoView.mock.instances[0] as Node)).toBe(
        true
      );
    });

    it("lets a client selected with no saved contact name be completed inline, without touching the saved record", async () => {
      seed({ brands: [brand()], clients: [client({ name: undefined })] });

      const user = userEvent.setup();
      renderWithProviders(<InvoiceForm />);

      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));
      await user.click(screen.getAllByRole("combobox")[1]);
      await user.click(await screen.findByRole("option", { name: "Acme Studio" }));

      // The gap is nudged right on the page — an editable field, not a
      // dead-end toast — and the copy says so without demanding anything.
      expect(
        screen.getByText(/Acme Studio has no contact name saved/)
      ).toBeInTheDocument();
      const contactField = screen.getByPlaceholderText("Optional — e.g. Priya Nair");
      await user.type(contactField, "Priya Nair");

      fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
        target: { value: "2026-07-20" },
      });
      const descriptionInput = screen.getByPlaceholderText("What did you do?");
      await user.type(descriptionInput, "Website redesign");
      const row = descriptionInput.parentElement as HTMLElement;
      await user.type(row.querySelectorAll("input")[1], "5000");

      await user.click(screen.getByRole("button", { name: "Create invoice" }));

      expect(push).toHaveBeenCalledWith("/dashboard");
      const saved = (await storage.getInvoices())[0];
      expect(saved.clientId).toBe("c1");
      expect(saved.client.name).toBe("Priya Nair");
      // This invoice's snapshot gained a contact name — the saved client
      // record itself must not have been silently rewritten.
      expect((await storage.getClients()).find((c) => c.id === "c1")?.name).toBeUndefined();
    });

    it("creates the invoice with the contact-name nudge left unanswered", async () => {
      // The nudge is a nudge: a client with no contact name gets the panel
      // and the field, but ignoring both must still produce an invoice.
      seed({ brands: [brand()], clients: [client({ name: undefined })] });

      const user = userEvent.setup();
      renderWithProviders(<InvoiceForm />);

      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));
      await user.click(screen.getAllByRole("combobox")[1]);
      await user.click(await screen.findByRole("option", { name: "Acme Studio" }));

      expect(screen.getByPlaceholderText("Optional — e.g. Priya Nair")).toBeInTheDocument();

      fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
        target: { value: "2026-07-20" },
      });
      const descriptionInput = screen.getByPlaceholderText("What did you do?");
      await user.type(descriptionInput, "Website redesign");
      const row = descriptionInput.parentElement as HTMLElement;
      await user.type(row.querySelectorAll("input")[1], "5000");

      await user.click(screen.getByRole("button", { name: "Create invoice" }));

      expect(push).toHaveBeenCalledWith("/dashboard");
      const saved = (await storage.getInvoices())[0];
      expect(saved.client.companyName).toBe("Acme Studio");
      expect(saved.client.name).toBeUndefined();
    });

    it('"Save as draft" still saves an otherwise-empty invoice — only a brand is required', async () => {
      seed({ brands: [brand()] });

      const user = userEvent.setup();
      renderWithProviders(<InvoiceForm />);

      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));

      // No client, no due date, no line items — none of the new "Create
      // invoice" checks apply here.
      await user.click(screen.getByRole("button", { name: "Save as draft" }));

      expect(push).toHaveBeenCalledWith("/dashboard");
      const saved = (await storage.getInvoices())[0];
      expect(saved.status).toBe("draft");
      expect(saved.dueDate).toBe("");
      expect(saved.clientId).toBeNull();
    });

    it("never blocks creation on a missing email", async () => {
      seed({ brands: [brand()], clients: [client({ email: undefined })] });

      const user = userEvent.setup();
      renderWithProviders(<InvoiceForm />);

      await user.click(screen.getAllByRole("combobox")[0]);
      await user.click(await screen.findByRole("option", { name: "Sivan Studio" }));
      await user.click(screen.getAllByRole("combobox")[1]);
      await user.click(await screen.findByRole("option", { name: "Acme Studio" }));

      fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
        target: { value: "2026-07-20" },
      });
      const descriptionInput = screen.getByPlaceholderText("What did you do?");
      await user.type(descriptionInput, "Website redesign");
      const row = descriptionInput.parentElement as HTMLElement;
      await user.type(row.querySelectorAll("input")[1], "5000");

      await user.click(screen.getByRole("button", { name: "Create invoice" }));

      expect(push).toHaveBeenCalledWith("/dashboard");
      expect((await storage.getInvoices())).toHaveLength(1);
    });

    describe("editing", () => {
      it('"Save changes" is never blocked by a missing contact name, but still offers the field', async () => {
        seed({ brands: [brand()], clients: [client({ name: undefined })] });
        const existing = invoice({ status: "sent" });
        seed({ invoices: [existing] });

        const user = userEvent.setup();
        renderWithProviders(<InvoiceForm existingInvoice={existing} />);

        // The nudge appears as soon as the client record loads — an editable
        // field, no asterisk, no error. `findBy` rather than `getBy` because
        // the gaps panel depends on the clients query having resolved.
        const contactField = await screen.findByPlaceholderText("Optional — e.g. Priya Nair");
        expect(contactField).not.toHaveAttribute("aria-invalid", "true");

        await user.type(contactField, "Priya Nair");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(push).toHaveBeenCalledWith("/dashboard");
        const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
        expect(saved?.status).toBe("sent");
        expect(saved?.client.name).toBe("Priya Nair");
        // This invoice's own snapshot gained the contact name — the saved
        // client record itself must not have been silently rewritten.
        expect((await storage.getClients()).find((c) => c.id === "c1")?.name).toBeUndefined();
      });

      it('"Save changes" goes through with the contact name left blank', async () => {
        seed({ brands: [brand()], clients: [client({ name: undefined })] });
        const existing = invoice({ status: "sent" });
        seed({ invoices: [existing] });

        const user = userEvent.setup();
        renderWithProviders(<InvoiceForm existingInvoice={existing} />);

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(toast).not.toHaveBeenCalledWith(
          expect.stringContaining("contact name")
        );
        expect(push).toHaveBeenCalledWith("/dashboard");
        expect((await storage.getInvoices()).find((i) => i.id === "i1")?.status).toBe("sent");
      });

      it('"Save changes" persists an edit when the invoice is already complete', async () => {
        seed({ brands: [brand()], clients: [client()] });
        const existing = invoice({ status: "sent", notes: "Original notes" });
        seed({ invoices: [existing] });

        const user = userEvent.setup();
        renderWithProviders(<InvoiceForm existingInvoice={existing} />);

        const notesField = screen.getByPlaceholderText("Payment terms, a thank-you, anything.");
        await user.clear(notesField);
        await user.type(notesField, "Updated notes");

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(push).toHaveBeenCalledWith("/dashboard");
        const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
        expect(saved?.notes).toBe("Updated notes");
      });

      it('"Save as draft" from the edit screen still saves with fields missing', async () => {
        seed({ brands: [brand()], clients: [client()] });
        const existing = invoice({ status: "sent" });
        seed({ invoices: [existing] });

        const user = userEvent.setup();
        renderWithProviders(<InvoiceForm existingInvoice={existing} />);

        // Clear the due date and the only line item's description — both
        // mandatory for "Save changes", neither should matter for a draft.
        fireEvent.change(document.getElementById("field-due-date")!.querySelector("input")!, {
          target: { value: "" },
        });
        const descriptionInput = screen.getByDisplayValue("Design work");
        await user.clear(descriptionInput);

        await user.click(screen.getByRole("button", { name: "Save as draft" }));

        expect(push).toHaveBeenCalledWith("/dashboard");
        const saved = (await storage.getInvoices()).find((i) => i.id === "i1");
        expect(saved?.status).toBe("draft");
        expect(saved?.dueDate).toBe("");
      });
    });
  });
});
