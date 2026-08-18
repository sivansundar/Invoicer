import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientForm } from "./client-form";
import { renderWithProviders } from "@/test/render";
import { failNext, failOnCall, resetFakeSeam, seed } from "@/test/fake-seam";
import * as storage from "@/lib/storage";
import type { Client, Invoice } from "@/lib/types";

// Clients live in Postgres now; invoices do not yet, so `saveInvoice` below
// is still synchronous and boolean-returning. See src/test/fake-seam.ts.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

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

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    companyName: "Acme Studio",
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
      name: "Sivan Studio",
      address: "44, 100 Feet Rd",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: "c1",
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("ClientForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    push.mockClear();
    toast.mockClear();
    vi.clearAllMocks();
  });

  it("toasts and does not save when the company name is blank", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClientForm />);

    await user.click(screen.getByRole("button", { name: "Add client" }));

    expect(toast).toHaveBeenCalledWith("Who are we billing? Add a company name");
    expect(push).not.toHaveBeenCalled();
    expect(await storage.getClients()).toHaveLength(0);
  });

  it("does not show a success toast or navigate away when the save itself fails", async () => {
    failNext("saveClient", "network unreachable");
    const user = userEvent.setup();
    renderWithProviders(<ClientForm />);

    await user.type(screen.getByPlaceholderText("e.g. Acme Studio"), "Acme Studio");
    await user.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith("network unreachable"));
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("added to your client book"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Acme Studio")).toBeInTheDocument();
  });

  it("toasts a distinct message on create vs. on editing an existing client", async () => {
    seed({ clients: [client()] });
    const user = userEvent.setup();
    renderWithProviders(<ClientForm client={client()} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("Acme Studio updated"))
    );
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("added to your client book"));
  });

  describe("deleting a client", () => {
    it("nulls clientId (and refreshes updatedAt) on every referencing invoice, leaving unrelated ones alone", async () => {
      seed({
        clients: [client()],
        invoices: [
          invoice({ id: "i1", clientId: "c1" }),
          invoice({ id: "i2", clientId: "c1" }),
          invoice({ id: "i3", clientId: "c2" }), // different client
          invoice({ id: "i4", clientId: null }), // already unlinked
        ],
      });

      const user = userEvent.setup();
      renderWithProviders(<ClientForm client={client()} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));
      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/clients"));

      expect(await storage.getClients()).toHaveLength(0);
      expect((await storage.getInvoices()).find((i) => i.id === "i1")?.clientId).toBeNull();
      expect((await storage.getInvoices()).find((i) => i.id === "i2")?.clientId).toBeNull();
      expect((await storage.getInvoices()).find((i) => i.id === "i1")?.updatedAt).not.toBe("2026-06-01T00:00:00.000Z");
      // Untouched: different client, and already-null.
      expect((await storage.getInvoices()).find((i) => i.id === "i3")?.clientId).toBe("c2");
      expect((await storage.getInvoices()).find((i) => i.id === "i4")?.clientId).toBeNull();

      expect(toast).toHaveBeenCalledWith("Acme Studio removed");
    });

    it("does not touch any invoice when the client record itself fails to delete", async () => {
      seed({ clients: [client()], invoices: [invoice({ id: "i1", clientId: "c1" })] });
      failNext("deleteClient", "network unreachable");

      const user = userEvent.setup();
      renderWithProviders(<ClientForm client={client()} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));
      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      // Order matters: nulling references before confirming the delete
      // persisted would risk unlinking invoices from a client that's still
      // there. A failed `remove` must short-circuit the whole cascade.
      await waitFor(() => expect(toast).toHaveBeenCalledWith("network unreachable"));
      expect(storage.saveInvoice).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("removed"));
      expect(push).not.toHaveBeenCalled();
    });

    it("does not delete until the confirmation is accepted", async () => {
      // Deleting a client also nulls `clientId` on every invoice that
      // references it. Invoice delete confirms; this is strictly more
      // consequential and did not.
      seed({ clients: [client()] });

      const user = userEvent.setup();
      renderWithProviders(<ClientForm client={client()} />);
      await user.click(screen.getByRole("button", { name: /delete client/i }));

      expect(storage.deleteClient).not.toHaveBeenCalled();
      expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^delete$/i }));
      // The mutation's second arg is TanStack Query's own call context
      // (queryClient/meta/mutationKey), not something this component
      // controls — only the id passed to `remove` matters here.
      await waitFor(() =>
        expect(storage.deleteClient).toHaveBeenCalledWith("c1", expect.anything())
      );
    });

    it("deletes nothing when the confirmation is cancelled", async () => {
      seed({ clients: [client()] });

      const user = userEvent.setup();
      renderWithProviders(<ClientForm client={client()} />);
      await user.click(screen.getByRole("button", { name: /delete client/i }));

      // Without this, the test would pass identically whether the dialog
      // opened or not — the form has its own always-present Cancel button
      // (unrelated to deletion) with the same accessible name, so a
      // page-wide `getByRole` query resolves to *something* even when the
      // confirmation flow never ran. Scoping to the dialog itself, after
      // confirming it's open, is what actually proves this test exercises
      // the confirm-then-cancel path.
      const dialog = await screen.findByRole("dialog");
      within(dialog).getByText(/cannot be undone/i);

      await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

      expect(storage.deleteClient).not.toHaveBeenCalled();
    });

    it("reports a partial failure honestly instead of claiming full success", async () => {
      seed({
        clients: [client()],
        invoices: [
          invoice({ id: "i1", clientId: "c1" }),
          invoice({ id: "i2", clientId: "c1" }),
          invoice({ id: "i3", clientId: "c1" }),
        ],
      });

      // Let the client delete and the 1st/3rd invoice writes through; fail
      // only the 2nd invoice write (a failure striking partway through the
      // cascade, which is the case the summary wording exists for).
      failOnCall("saveInvoice", 2);

      const user = userEvent.setup();
      renderWithProviders(<ClientForm client={client()} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));
      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      // The client itself is still gone — that write succeeded and isn't
      // undone — but the summary must name the shortfall, not claim a plain
      // "removed" the way it would if the failed write were ignored.
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(expect.stringContaining("couldn't be re-linked"))
      );
      expect(await storage.getClients()).toHaveLength(0);
      expect(toast).not.toHaveBeenCalledWith("Acme Studio removed");
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("1 of 3"));
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("couldn't be re-linked"));
    });
  });
});
