import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport } from "./import-export";
import type { Brand, Client, Invoice } from "@/lib/types";

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand-1",
    name: "Sivan Studio",
    address: "12 MG Road, Bengaluru",
    email: "hello@sivanstudio.com",
    invoicePrefix: "SC",
    nextInvoiceNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    bankDetails: {
      accountName: "Sivan Studio",
      accountNumber: "1234567890",
      bankName: "HDFC Bank",
      ifscCode: "HDFC0000123",
    },
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    companyName: "Acme Studio",
    address: "12 Residency Rd, Bengaluru 560025",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoiceNumber: "SC2026001",
    brandId: "brand-1",
    currency: "INR",
    status: "paid",
    billDate: "2026-07-10",
    dueDate: "2026-07-24",
    client: {
      companyName: "Acme Studio",
      address: "12 Residency Rd, Bengaluru 560025",
    },
    items: [{ id: "li1", description: "Website redesign", amount: 40000, tax: 18 }],
    subtotal: 40000,
    totalTax: 7200,
    total: 47200,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

function backupFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], "backup.json", {
    type: "application/json",
  });
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

describe("ImportExport orchestration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes brands and clients to localStorage before invoices are read, for a full backup envelope", async () => {
    const user = userEvent.setup();
    render(<ImportExport onImportDone={vi.fn()} />);

    // Record every localStorage get/set in the order it actually happens —
    // not just the end state — so a regression that silently reorders
    // brands/clients writes ahead of (or behind) the invoice-conflict read
    // is caught even though the final data would look identical either way.
    const callLog: Array<{ method: "get" | "set"; key: string }> = [];
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(
      (key: string, value: string) => {
        callLog.push({ method: "set", key });
        originalSetItem(key, value);
      }
    );
    vi.spyOn(window.localStorage, "getItem").mockImplementation((key: string) => {
      callLog.push({ method: "get", key });
      return originalGetItem(key);
    });

    const brand = makeBrand();
    const client = makeClient();
    const invoice = makeInvoice({ brandId: brand.id });

    await user.upload(
      getFileInput(),
      backupFile({
        version: 2,
        exportedAt: "2026-07-30T00:00:00.000Z",
        brands: [brand],
        clients: [client],
        invoices: [invoice],
      })
    );

    await screen.findByText("Import Complete");

    const lastBrandOrClientWrite = callLog.reduce(
      (last, entry, index) =>
        entry.method === "set" &&
        (entry.key === "invoicer_brands" || entry.key === "invoicer_clients")
          ? index
          : last,
      -1
    );
    const firstInvoiceRead = callLog.findIndex(
      (entry) => entry.method === "get" && entry.key === "invoicer_invoices"
    );

    expect(lastBrandOrClientWrite).toBeGreaterThanOrEqual(0);
    expect(firstInvoiceRead).toBeGreaterThanOrEqual(0);
    expect(lastBrandOrClientWrite).toBeLessThan(firstInvoiceRead);

    // End-state matters too, not just ordering.
    expect(
      JSON.parse(window.localStorage.getItem("invoicer_brands") ?? "[]")
    ).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem("invoicer_clients") ?? "[]")
    ).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem("invoicer_invoices") ?? "[]")
    ).toHaveLength(1);
  });

  it("reports a quota-simulated setItem failure as failed, not imported", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ImportExport onImportDone={vi.fn()} />);

    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(
      (key: string, value: string) => {
        if (key === "invoicer_brands") {
          throw new DOMException(
            "The quota has been exceeded.",
            "QuotaExceededError"
          );
        }
        originalSetItem(key, value);
      }
    );

    const brand = makeBrand();

    await user.upload(
      getFileInput(),
      backupFile({
        version: 2,
        exportedAt: "2026-07-30T00:00:00.000Z",
        brands: [brand],
        clients: [],
        invoices: [],
      })
    );

    await screen.findByText("Import Complete");

    const importedRow = screen.getByText("Brands imported").closest("div");
    expect(importedRow).toHaveTextContent("0");

    const failedRow = screen.getByText("Brands failed to save").closest("div");
    expect(failedRow).toHaveTextContent("1");

    // The failed write never actually persisted.
    expect(window.localStorage.getItem("invoicer_brands")).toBeNull();

    // finishImport surfaces the failure rather than letting the dialog
    // silently claim success.
    expect(alertSpy).toHaveBeenCalled();
    expect(alertSpy.mock.calls[0][0]).toMatch(/couldn't be saved/);

    consoleErrorSpy.mockRestore();
  });
});
