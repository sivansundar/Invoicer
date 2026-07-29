import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport } from "./import-export";
import * as storage from "@/lib/storage";
import type { Invoice } from "@/lib/types";

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
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

function jsonFile(invoices: Invoice[]): File {
  return new File([JSON.stringify(invoices)], "invoices.json", { type: "application/json" });
}

function uploadFile(container: HTMLElement, invoices: Invoice[]) {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [jsonFile(invoices)] } });
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
