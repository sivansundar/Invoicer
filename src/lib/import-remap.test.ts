import { describe, expect, it } from "vitest";
import { isUuid, remapNonUuidIds, type BackupCollections } from "./import-remap";
import { SEED_TEMPLATES } from "./seed";
import type { Brand, Client, EmailTemplate, Invoice } from "./types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: UUID_A,
    name: "Sivan Studio",
    address: "",
    email: "",
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
    invoiceDesign: "modern",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: UUID_B,
    companyName: "Acme Studio",
    address: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    invoiceNumber: "SC-2026-001",
    brandId: UUID_A,
    clientId: UUID_B,
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme Studio", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 0,
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
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

function collections(overrides: Partial<BackupCollections> = {}): BackupCollections {
  return { brands: [], clients: [], templates: [], invoices: [], ...overrides };
}

describe("isUuid", () => {
  it("accepts what Postgres accepts and rejects the legacy template ids", () => {
    expect(isUuid(UUID_A)).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid("tpl-gentle-nudge")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("11111111-1111-4111-8111")).toBe(false);
  });
});

describe("remapNonUuidIds", () => {
  it("leaves a backup whose ids are already uuids completely untouched", () => {
    const input = collections({
      brands: [brand()],
      clients: [client()],
      invoices: [invoice()],
    });

    const { collections: output, remapped } = remapNonUuidIds(input);

    expect(remapped).toBe(0);
    expect(output).toEqual(input);
  });

  it("rewrites the seeded template ids a pre-Postgres backup carries", () => {
    const input = collections({ templates: SEED_TEMPLATES as EmailTemplate[] });

    const { collections: output, remapped } = remapNonUuidIds(input);

    expect(remapped).toBe(3);
    expect(output.templates.every((t) => isUuid(t.id))).toBe(true);
    // Content is untouched — only the id changes.
    expect(output.templates.map((t) => t.name)).toEqual(SEED_TEMPLATES.map((t) => t.name));
    expect(output.templates[0].body).toBe(SEED_TEMPLATES[0].body);
  });

  it("follows a remapped template id through to every brand that referenced it", () => {
    const input = collections({
      templates: [SEED_TEMPLATES[0] as EmailTemplate],
      brands: [
        brand({ id: UUID_A, followup: { ...brand().followup, templateId: "tpl-gentle-nudge" } }),
        brand({
          id: "44444444-4444-4444-8444-444444444444",
          followup: { ...brand().followup, templateId: "tpl-gentle-nudge" },
        }),
      ],
    });

    const { collections: output } = remapNonUuidIds(input);

    const newTemplateId = output.templates[0].id;
    expect(isUuid(newTemplateId)).toBe(true);
    expect(output.brands.map((b) => b.followup.templateId)).toEqual([
      newTemplateId,
      newTemplateId,
    ]);
  });

  it("clears a templateId that points at nothing in the file", () => {
    // Already dangling before the export. Carrying it would leave a
    // reference that looks like a template lost during the restore.
    const input = collections({
      brands: [brand({ followup: { ...brand().followup, templateId: "tpl-deleted-long-ago" } })],
    });

    const { collections: output } = remapNonUuidIds(input);

    expect(output.brands[0].followup.templateId).toBe("");
  });

  it("leaves an empty templateId alone rather than treating it as dangling", () => {
    const input = collections({ brands: [brand()] });

    expect(remapNonUuidIds(input).collections.brands[0].followup.templateId).toBe("");
  });

  it("follows remapped brand and client ids through to their invoices", () => {
    const input = collections({
      brands: [brand({ id: "legacy-brand" })],
      clients: [client({ id: "legacy-client" })],
      invoices: [invoice({ brandId: "legacy-brand", clientId: "legacy-client" })],
    });

    const { collections: output } = remapNonUuidIds(input);

    expect(output.invoices[0].brandId).toBe(output.brands[0].id);
    expect(output.invoices[0].clientId).toBe(output.clients[0].id);
    expect(isUuid(output.invoices[0].brandId)).toBe(true);
  });

  it("keeps a null clientId null rather than remapping it", () => {
    const input = collections({
      brands: [brand({ id: "legacy-brand" })],
      invoices: [invoice({ brandId: "legacy-brand", clientId: null })],
    });

    expect(remapNonUuidIds(input).collections.invoices[0].clientId).toBeNull();
  });

  it("gives two records with different legacy ids two different new ids", () => {
    const input = collections({
      templates: [
        SEED_TEMPLATES[0] as EmailTemplate,
        SEED_TEMPLATES[1] as EmailTemplate,
        SEED_TEMPLATES[2] as EmailTemplate,
      ],
    });

    const ids = remapNonUuidIds(input).collections.templates.map((t) => t.id);

    expect(new Set(ids).size).toBe(3);
  });

  it("never rewrites an invoice number — only ids", () => {
    const input = collections({
      brands: [brand({ id: "legacy-brand" })],
      invoices: [invoice({ id: "legacy-invoice", brandId: "legacy-brand" })],
    });

    const { collections: output } = remapNonUuidIds(input);

    expect(output.invoices[0].invoiceNumber).toBe("SC-2026-001");
    expect(isUuid(output.invoices[0].id)).toBe(true);
  });
});
