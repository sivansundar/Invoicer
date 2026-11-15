import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLegacyBackup, upgradeImported } from "./backup";
import { isValidBrandRecord, isValidClientRecord, isValidInvoiceRecord, validateImportedBackup } from "./import-validation";
import type { Brand, Client, Invoice } from "./types";

vi.mock("sonner", () => ({ toast: vi.fn() }));

// What the oldest version of the site wrote to the browser: no accent colour,
// follow-up config or design on a brand; no brand snapshot, client link or
// reminder history on an invoice.
const oldBrand = {
  id: "b1",
  name: "Sivan Studio",
  address: "44, 100 Feet Rd, Indiranagar, Bengaluru 560038",
  email: "billing@sivan.studio",
  invoicePrefix: "SC",
  nextInvoiceNumber: 15,
  createdAt: "2026-01-01T00:00:00.000Z",
  bankDetails: { accountName: "Sivan Studio", accountNumber: "50100234914210", bankName: "HDFC Bank", ifscCode: "HDFC0001234" },
};
const oldClient = {
  id: "c1",
  companyName: "Acme Studio",
  address: "12 Residency Rd, Bengaluru 560025",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const oldInvoice = {
  id: "i1",
  invoiceNumber: "SC2026001",
  brandId: "b1",
  currency: "INR",
  status: "paid",
  billDate: "2026-07-10",
  dueDate: "2026-07-24",
  client: { companyName: "Acme Studio", address: "12 Residency Rd, Bengaluru 560025" },
  items: [{ id: "li1", description: "Website redesign", amount: 40000, tax: 18 }],
  subtotal: 40000,
  totalTax: 7200,
  total: 47200,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

describe("old users' data", () => {
  beforeEach(() => localStorage.clear());

  it("exports what an old browser holds, in the current format, without touching the browser copy's contents", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([oldBrand]));
    localStorage.setItem("invoicer_clients", JSON.stringify([oldClient]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([oldInvoice]));

    const backup = readLegacyBackup();

    expect(backup.brands).toHaveLength(1);
    expect(backup.clients).toHaveLength(1);
    expect(backup.invoices).toHaveLength(1);
    expect(backup.invoices[0].total).toBe(47200);
    expect(backup.invoices[0].brandSnapshot.name).toBe("Sivan Studio");
    // Still in the browser afterwards.
    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(1);
  });

  it("returns empty lists, not an error, for a browser with nothing or with corrupt data", () => {
    expect(readLegacyBackup().invoices).toEqual([]);
    localStorage.setItem("invoicer_invoices", "{not json");
    expect(readLegacyBackup().invoices).toEqual([]);
  });

  it("an exported file passes import validation and every record is one the server accepts", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([oldBrand]));
    localStorage.setItem("invoicer_clients", JSON.stringify([oldClient]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([oldInvoice]));
    // Through JSON, as the downloaded file would be.
    const file = JSON.parse(JSON.stringify({ version: 2, exportedAt: "x", ...readLegacyBackup() }));

    const result = validateImportedBackup(file);
    if (!result.ok) throw new Error("backup rejected");
    const upgraded = upgradeImported(
      { brands: [], clients: [] },
      { brands: result.brands.valid, clients: result.clients.valid, invoices: result.invoices.valid }
    );

    expect(result.brands.skipped + result.clients.skipped + result.invoices.skipped).toBe(0);
    expect(upgraded.brands.every(isValidBrandRecord)).toBe(true);
    expect(upgraded.clients.every(isValidClientRecord)).toBe(true);
    expect(upgraded.invoices.every(isValidInvoiceRecord)).toBe(true);
  });

  it("upgrades a file exported by the old site itself (old-format records) on import", () => {
    const upgraded = upgradeImported(
      { brands: [], clients: [] },
      {
        brands: [oldBrand as unknown as Brand],
        clients: [oldClient as unknown as Client],
        invoices: [oldInvoice as unknown as Invoice],
      }
    );

    expect(upgraded.brands[0].invoiceDesign).toBeDefined();
    expect(upgraded.brands[0].followup).toBeDefined();
    expect(upgraded.invoices[0].brandSnapshot.name).toBe("Sivan Studio");
    expect(upgraded.invoices[0].clientId).toBe("c1");
    expect(upgraded.invoices[0].reminders).toEqual([]);
  });

  it("upgrades an invoices-only file against brands already in the account, and returns only the imported records", () => {
    const existing = upgradeImported({ brands: [], clients: [] }, { brands: [oldBrand as unknown as Brand], clients: [], invoices: [] });

    const upgraded = upgradeImported(
      { brands: existing.brands, clients: [] },
      { brands: [], clients: [], invoices: [oldInvoice as unknown as Invoice] }
    );

    expect(upgraded.brands).toEqual([]);
    expect(upgraded.invoices[0].brandSnapshot.name).toBe("Sivan Studio");
  });
});
