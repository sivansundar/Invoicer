import type { Brand, BrandSnapshot, Client, EmailTemplate, Invoice } from "@/lib/types";

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

/**
 * A full, importable `Invoice` — every field `validateImportedBackup`
 * requires, plus the ones downstream screens read without a guard. Moved
 * here from `import-export.test.tsx`, which defined it locally before other
 * suites (the one-time local-data import prompt) needed the same fixture.
 * Deliberately a distinct shape from `makeInvoice` above rather than a
 * merge: that one is the minimal record other suites want, this one is the
 * "what a real export file contains" record import/backup tests want.
 */
export function validInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "aaaaaaa1-0000-4000-8000-000000000001",
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

/** A full, importable `Brand` — see `validInvoice` above for why this lives apart from any minimal fixture. */
export function validBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "bbbbbbb1-0000-4000-8000-000000000001",
    name: "Sivan Studio",
    address: "12 MG Road, Bengaluru",
    email: "hello@sivanstudio.com",
    invoicePrefix: "SC",
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

/** A full, importable `Client` — see `validInvoice` above for why this lives apart from any minimal fixture. */
export function validClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "ccccccc1-0000-4000-8000-000000000001",
    companyName: "Acme Studio",
    address: "12 Residency Rd, Bengaluru 560025",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A full, importable `EmailTemplate` — see `validInvoice` above for why this lives apart from any minimal fixture. */
export function validTemplate(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "ddddddd1-0000-4000-8000-000000000001",
    name: "Gentle nudge",
    subject: "Following up on {{invoiceNumber}}",
    tone: "Friendly",
    body: "Hi {{clientName}}, just a friendly nudge...",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
