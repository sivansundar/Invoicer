import type { BrandSnapshot, Invoice } from "@/lib/types";

/**
 * Minimal valid `BrandSnapshot`, overridable per test. Neither `logo` nor
 * `logoPath` is set by default — a snapshot with neither is a legitimate
 * (if logo-less) brand, not an invalid fixture.
 */
export function makeSnapshot(overrides: Partial<BrandSnapshot> = {}): BrandSnapshot {
  return {
    name: "Brand One",
    address: "",
    invoicePrefix: "BR",
    accentColor: "#4f46e5",
    invoiceDesign: "modern",
    bankDetails: {
      accountName: "",
      accountNumber: "",
      bankName: "",
      ifscCode: "",
    },
    ...overrides,
  };
}

/**
 * Minimal valid `Invoice`, overridable per test. `brandSnapshot` defaults to
 * `makeSnapshot()`'s output rather than being duplicated here, so the two
 * stay in sync.
 */
export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "id-1",
    invoiceNumber: "INV-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-07-01",
    dueDate: "2026-07-20",
    client: { companyName: "Client One", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 1000,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "",
    brandSnapshot: makeSnapshot(),
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}
