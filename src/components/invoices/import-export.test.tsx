import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport } from "./import-export";
import * as storage from "@/lib/storage";
import type { Brand, Client, EmailTemplate, Invoice } from "@/lib/types";

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "id-1",
    invoiceNumber: "INV-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme Studio", address: "" },
    items: [{ id: "li1", description: "Design work", amount: 1000, tax: 18 }],
    subtotal: 1000,
    totalTax: 180,
    total: 1180,
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

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand-1",
    name: "Sivan Studio",
    address: "12 MG Road, Bengaluru",
    email: "hello@sivanstudio.com",
    invoicePrefix: "SC",
    nextInvoiceNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: false,
      mode: "weekly",
      weekday: 2,
      time: "09:00",
      repeat: "week",
      templateId: "tpl-gentle-nudge",
      stopAfter: 0,
    },
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    invoiceDesign: "modern",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    companyName: "Acme Studio",
    address: "12 Residency Rd, Bengaluru 560025",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "tpl-1",
    name: "Gentle nudge",
    subject: "Following up on {{invoiceNumber}}",
    tone: "Friendly",
    body: "Hi {{clientName}}, just a friendly nudge...",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function jsonFile(payload: unknown, name = "invoices.json"): File {
  return new File([JSON.stringify(payload)], name, { type: "application/json" });
}

function uploadFile(container: HTMLElement, payload: unknown, name = "invoices.json") {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [jsonFile(payload, name)] } });
}

describe("ImportExport — rename conflict resolution", () => {
  beforeEach(() => {
    window.localStorage.clear();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables Confirm on the prefilled (still-colliding) value, and it never overwrites the existing invoice", async () => {
    storage.saveInvoice(invoice({ id: "existing-1", invoiceNumber: "INV-001" }));

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "incoming-1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    // Prefilled with the exact number that's already taken.
    expect(screen.getByPlaceholderText("e.g. INV-042")).toHaveValue("INV-001");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(
      screen.getByText("That invoice number is already in use — choose a different one.")
    ).toBeInTheDocument();
  });

  it("stays disabled when edited to a number that collides with a different existing invoice", async () => {
    storage.saveInvoice(invoice({ id: "existing-1", invoiceNumber: "INV-001" }));
    storage.saveInvoice(invoice({ id: "existing-2", invoiceNumber: "INV-002" }));

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "incoming-1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    const input = screen.getByPlaceholderText("e.g. INV-042");
    await userEvent.clear(input);
    await userEvent.type(input, "INV-002");

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("enables Confirm once the value is edited to a genuinely free number, and saves under it", async () => {
    storage.saveInvoice(invoice({ id: "existing-1", invoiceNumber: "INV-001" }));

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "incoming-1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    const input = screen.getByPlaceholderText("e.g. INV-042");
    await userEvent.clear(input);
    await userEvent.type(input, "INV-999");

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    const numbers = storage.getInvoices().map((i) => i.invoiceNumber).sort();
    expect(numbers).toEqual(["INV-001", "INV-999"]);
  });
});

describe("ImportExport — full backup envelope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores brands, clients, templates and invoices from a full backup into an empty app", async () => {
    const b = brand();
    const c = client();
    const t = template();
    const inv = invoice({ brandId: b.id, clientId: c.id });

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        exportedAt: "2026-07-28T00:00:00.000Z",
        brands: [b],
        clients: [c],
        templates: [t],
        invoices: [inv],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect(storage.getBrands().map((x) => x.id)).toEqual([b.id]);
    expect(storage.getClients().map((x) => x.id)).toEqual([c.id]);
    expect(storage.getTemplates().map((x) => x.id)).toEqual([t.id]);
    expect(storage.getInvoices().map((x) => x.id)).toEqual([inv.id]);
  });

  it("skips brands/clients/templates whose id already exists locally, without overwriting them", async () => {
    storage.saveBrand(brand({ name: "Original Name" }));
    storage.saveClient(client({ companyName: "Original Co" }));
    storage.saveTemplate(template({ name: "Original Template" }));

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        brands: [brand({ name: "Imported Name" })],
        clients: [client({ companyName: "Imported Co" })],
        templates: [template({ name: "Imported Template" })],
        invoices: [],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect(storage.getBrands()).toHaveLength(1);
    expect(storage.getBrands()[0].name).toBe("Original Name");
    expect(storage.getClients()[0].companyName).toBe("Original Co");
    expect(storage.getTemplates()[0].name).toBe("Original Template");

    expect(screen.getByText("Brands skipped (already exist)")).toBeInTheDocument();
    expect(screen.getByText("Clients skipped (already exist)")).toBeInTheDocument();
    expect(screen.getByText("Templates skipped (already exist)")).toBeInTheDocument();
  });

  it("rejects a JSON value that is neither an array nor an object outright", async () => {
    // `"just a string"` is valid JSON (a JSON string literal), so this
    // exercises the *shape* rejection in `validateImportedBackup`, not the
    // `JSON.parse` failure path (covered by the "rename conflict resolution"
    // describe block's malformed-JSON case elsewhere in this file).
    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, "just a string", "backup.json");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining("Failed to import — expected an Invoicer backup file")
      )
    );
    expect(storage.getInvoices()).toHaveLength(0);
  });

  it("reports a malformed collection honestly and still imports what's readable", async () => {
    const b = brand();

    const { container } = render(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        brands: [b],
        clients: "not a list",
        templates: [{ junk: true }, null],
        invoices: [],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect(storage.getBrands().map((x) => x.id)).toEqual([b.id]);
    expect(storage.getClients()).toHaveLength(0);
    // Neither junk template record was imported — what's left is the seeded
    // defaults `forceMigration` writes when the templates collection is
    // empty (pre-existing `migrateToV2` behaviour, not this feature), not a
    // resurrection of the rejected records.
    expect(storage.getTemplates().map((x) => x.id).sort()).toEqual(
      ["tpl-final-notice", "tpl-gentle-nudge", "tpl-second-reminder"]
    );
    expect(screen.getByText("Clients section unreadable")).toBeInTheDocument();
    expect(screen.getByText("Templates skipped (invalid)")).toBeInTheDocument();
  });
});
