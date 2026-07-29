import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientForm } from "./client-form";
import * as storage from "@/lib/storage";
import type { Client, Invoice } from "@/lib/types";

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
    storage.runMigration();
    push.mockClear();
    toast.mockClear();
    vi.restoreAllMocks();
  });

  it("toasts and does not save when the company name is blank", async () => {
    const user = userEvent.setup();
    render(<ClientForm />);

    await user.click(screen.getByRole("button", { name: "Add client" }));

    expect(toast).toHaveBeenCalledWith("Who are we billing? Add a company name");
    expect(push).not.toHaveBeenCalled();
    expect(storage.getClients()).toHaveLength(0);
  });

  it("does not show a success toast or navigate away when the save itself fails", async () => {
    vi.spyOn(storage, "saveClient").mockReturnValue(false);
    const user = userEvent.setup();
    render(<ClientForm />);

    await user.type(screen.getByPlaceholderText("e.g. Acme Studio"), "Acme Studio");
    await user.click(screen.getByRole("button", { name: "Add client" }));

    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("added to your client book"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Acme Studio")).toBeInTheDocument();
  });

  it("toasts a distinct message on create vs. on editing an existing client", async () => {
    storage.saveClient(client());
    const user = userEvent.setup();
    render(<ClientForm client={storage.getClients().find((c) => c.id === "c1")!} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Acme Studio updated")
    );
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("added to your client book"));
  });

  describe("deleting a client", () => {
    it("nulls clientId (and refreshes updatedAt) on every referencing invoice, leaving unrelated ones alone", async () => {
      storage.saveClient(client());
      storage.saveInvoice(invoice({ id: "i1", clientId: "c1" }));
      storage.saveInvoice(invoice({ id: "i2", clientId: "c1" }));
      storage.saveInvoice(invoice({ id: "i3", clientId: "c2" })); // different client
      storage.saveInvoice(invoice({ id: "i4", clientId: null })); // already unlinked

      const user = userEvent.setup();
      render(<ClientForm client={storage.getClients().find((c) => c.id === "c1")!} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));

      expect(storage.getClients()).toHaveLength(0);
      expect(storage.getInvoices().find((i) => i.id === "i1")?.clientId).toBeNull();
      expect(storage.getInvoices().find((i) => i.id === "i2")?.clientId).toBeNull();
      expect(storage.getInvoices().find((i) => i.id === "i1")?.updatedAt).not.toBe("2026-06-01T00:00:00.000Z");
      // Untouched: different client, and already-null.
      expect(storage.getInvoices().find((i) => i.id === "i3")?.clientId).toBe("c2");
      expect(storage.getInvoices().find((i) => i.id === "i4")?.clientId).toBeNull();

      expect(toast).toHaveBeenCalledWith("Acme Studio removed");
      expect(push).toHaveBeenCalledWith("/clients");
    });

    it("does not touch any invoice when the client record itself fails to delete", async () => {
      storage.saveClient(client());
      storage.saveInvoice(invoice({ id: "i1", clientId: "c1" }));
      vi.spyOn(storage, "deleteClient").mockReturnValue(false);
      const saveInvoiceSpy = vi.spyOn(storage, "saveInvoice");

      const user = userEvent.setup();
      render(<ClientForm client={storage.getClients().find((c) => c.id === "c1")!} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));

      // Order matters: nulling references before confirming the delete
      // persisted would risk unlinking invoices from a client that's still
      // there. A failed `remove` must short-circuit the whole cascade.
      expect(saveInvoiceSpy).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("removed"));
      expect(push).not.toHaveBeenCalled();
    });

    it("reports a partial failure honestly instead of claiming full success", async () => {
      storage.saveClient(client());
      storage.saveInvoice(invoice({ id: "i1", clientId: "c1" }));
      storage.saveInvoice(invoice({ id: "i2", clientId: "c1" }));
      storage.saveInvoice(invoice({ id: "i3", clientId: "c1" }));

      // Let the client delete and the 1st/3rd invoice writes through; fail
      // only the 2nd invoice write (simulating a quota exhausted partway
      // through the cascade).
      const realSaveInvoice = storage.saveInvoice;
      let invoiceWriteCount = 0;
      vi.spyOn(storage, "saveInvoice").mockImplementation((inv) => {
        invoiceWriteCount += 1;
        if (invoiceWriteCount === 2) return false;
        return realSaveInvoice(inv);
      });

      const user = userEvent.setup();
      render(<ClientForm client={storage.getClients().find((c) => c.id === "c1")!} />);

      await user.click(screen.getByRole("button", { name: "Delete client" }));

      // The client itself is still gone — that write succeeded and isn't
      // undone — but the summary must name the shortfall, not claim a plain
      // "removed" the way it would if the failed write were ignored.
      expect(storage.getClients()).toHaveLength(0);
      expect(toast).not.toHaveBeenCalledWith("Acme Studio removed");
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("1 of 3"));
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("couldn't be re-linked"));
    });
  });
});
