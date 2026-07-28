import { beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, migrateToV2, runMigration } from "./migrate";
import { DEFAULT_TEMPLATE_ID, SEED_TEMPLATES } from "./seed";
import { BRAND_PALETTE } from "./palette";

const v1Brand = {
  id: "b1",
  name: "Sivan Studio",
  address: "44, 100 Feet Rd, Indiranagar, Bengaluru 560038",
  email: "billing@sivan.studio",
  gstNumber: "29ABCDE1234F1Z5",
  invoicePrefix: "SC",
  nextInvoiceNumber: 15,
  createdAt: "2026-01-01T00:00:00.000Z",
  bankDetails: {
    accountName: "Sivan Studio",
    accountNumber: "50100234914210",
    bankName: "HDFC Bank",
    ifscCode: "HDFC0001234",
    branch: "Indiranagar",
    upiId: "sivan@okhdfc",
  },
};

const v1Client = {
  id: "c1",
  companyName: "Acme Studio",
  name: "Priya Nair",
  address: "12 Residency Rd, Bengaluru 560025",
  email: "accounts@acmestudio.in",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const v1Invoice = {
  id: "i1",
  invoiceNumber: "SC2026001",
  brandId: "b1",
  currency: "INR",
  status: "paid",
  billDate: "2026-07-10",
  dueDate: "2026-07-24",
  client: {
    companyName: "Acme Studio",
    name: "Priya Nair",
    address: "12 Residency Rd, Bengaluru 560025",
  },
  items: [{ id: "li1", description: "Website redesign", amount: 40000, tax: 18 }],
  subtotal: 40000,
  totalTax: 7200,
  total: 47200,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

function migrate(overrides: Partial<Parameters<typeof migrateToV2>[0]> = {}) {
  return migrateToV2({
    brands: [v1Brand],
    clients: [v1Client],
    invoices: [v1Invoice],
    templates: [],
    ...overrides,
  });
}

describe("migrateToV2 — brands", () => {
  it("assigns an accent colour from the palette", () => {
    expect(migrate().brands[0].accentColor).toBe(BRAND_PALETTE[0]);
  });

  it("gives every brand a default follow-up config", () => {
    const followup = migrate().brands[0].followup;
    expect(followup.enabled).toBe(true);
    expect(followup.mode).toBe("weekly");
    expect(followup.templateId).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("preserves every existing brand field", () => {
    const brand = migrate().brands[0];
    expect(brand.name).toBe("Sivan Studio");
    expect(brand.invoicePrefix).toBe("SC");
    expect(brand.bankDetails.ifscCode).toBe("HDFC0001234");
  });

  it("does not overwrite an accent colour that is already set", () => {
    const result = migrateToV2({
      brands: [{ ...v1Brand, accentColor: "#059669" }],
      clients: [],
      invoices: [],
      templates: [],
    });
    expect(result.brands[0].accentColor).toBe("#059669");
  });

  it("does not overwrite an accent colour that is an empty string", () => {
    // "" is falsy but not nullish — this is the one field where ?? and ||
    // genuinely diverge. || would incorrectly replace it with a palette colour.
    const result = migrateToV2({
      brands: [{ ...v1Brand, accentColor: "" }],
      clients: [],
      invoices: [],
      templates: [],
    });
    expect(result.brands[0].accentColor).toBe("");
  });
});

describe("migrateToV2 — invoices", () => {
  it("never rewrites an existing invoice number", () => {
    expect(migrate().invoices[0].invoiceNumber).toBe("SC2026001");
  });

  it("preserves the embedded client snapshot", () => {
    expect(migrate().invoices[0].client.companyName).toBe("Acme Studio");
  });

  it("back-references the matching client by company name", () => {
    expect(migrate().invoices[0].clientId).toBe("c1");
  });

  it("matches company names case- and whitespace-insensitively", () => {
    const result = migrateToV2({
      brands: [v1Brand],
      clients: [{ ...v1Client, companyName: "  acme studio " }],
      invoices: [v1Invoice],
      templates: [],
    });
    expect(result.invoices[0].clientId).toBe("c1");
  });

  it("sets clientId to null when no client record matches", () => {
    const result = migrateToV2({
      brands: [v1Brand],
      clients: [],
      invoices: [v1Invoice],
      templates: [],
    });
    expect(result.invoices[0].clientId).toBeNull();
  });

  it("snapshots the brand onto the invoice", () => {
    const snapshot = migrate().invoices[0].brandSnapshot;
    expect(snapshot.name).toBe("Sivan Studio");
    expect(snapshot.invoicePrefix).toBe("SC");
    expect(snapshot.bankDetails.accountNumber).toBe("50100234914210");
  });

  it("synthesises a snapshot when the brand no longer exists", () => {
    const result = migrateToV2({
      brands: [],
      clients: [v1Client],
      invoices: [v1Invoice],
      templates: [],
    });
    const snapshot = result.invoices[0].brandSnapshot;
    expect(snapshot.name).toBe("Unknown brand");
    expect(snapshot.invoicePrefix).toBe("SC");
    expect(snapshot.accentColor).toBe(BRAND_PALETTE[0]);
    expect(snapshot.bankDetails).toEqual({
      accountName: "",
      accountNumber: "",
      bankName: "",
      ifscCode: "",
    });
  });

  it("initialises the follow-up fields", () => {
    const invoice = migrate().invoices[0];
    expect(invoice.reminders).toEqual([]);
    expect(invoice.followupsPaused).toBe(false);
  });

  it("preserves totals exactly", () => {
    const invoice = migrate().invoices[0];
    expect(invoice.subtotal).toBe(40000);
    expect(invoice.totalTax).toBe(7200);
    expect(invoice.total).toBe(47200);
  });
});

describe("migrateToV2 — templates", () => {
  it("seeds the three default templates when none exist", () => {
    expect(migrate().templates).toHaveLength(SEED_TEMPLATES.length);
  });

  it("leaves existing templates untouched", () => {
    const existing = [{ ...SEED_TEMPLATES[0], name: "My nudge" }];
    const result = migrateToV2({
      brands: [],
      clients: [],
      invoices: [],
      templates: existing,
    });
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("My nudge");
  });
});

describe("migrateToV2 — malformed elements", () => {
  it("drops unsalvageable elements without aborting the migration", () => {
    const result = migrateToV2({
      brands: [null],
      clients: [v1Client, null],
      invoices: [v1Invoice, "garbage"],
      templates: [],
    });

    expect(result.brands).toHaveLength(0);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].id).toBe("c1");
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].invoiceNumber).toBe("SC2026001");
    expect(result.invoices[0].brandSnapshot).toBeDefined();
  });

  it("returns the dropped elements verbatim, keyed by collection", () => {
    const result = migrateToV2({
      brands: [null],
      clients: [v1Client, null],
      invoices: [v1Invoice, "garbage"],
      templates: [],
    });

    expect(result.dropped.brands).toEqual([null]);
    expect(result.dropped.clients).toEqual([null]);
    expect(result.dropped.invoices).toEqual(["garbage"]);
  });

  it("reports empty dropped arrays when everything is well-formed", () => {
    const result = migrate();

    expect(result.dropped).toEqual({ brands: [], clients: [], invoices: [] });
  });
});

describe("migrateToV2 — idempotence", () => {
  it("produces an identical result when run on its own output", () => {
    const once = migrate();
    const twice = migrateToV2(once);
    expect(twice).toEqual(once);
  });
});

describe("runMigration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes the schema version and upgraded records", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_clients", JSON.stringify([v1Client]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));

    runMigration();

    expect(localStorage.getItem("invoicer_schema_version")).toBe(String(SCHEMA_VERSION));
    const invoices = JSON.parse(localStorage.getItem("invoicer_invoices")!);
    expect(invoices[0].clientId).toBe("c1");
    expect(invoices[0].invoiceNumber).toBe("SC2026001");
  });

  it("does nothing on a second run", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));
    runMigration();
    const after = localStorage.getItem("invoicer_invoices");
    runMigration();
    expect(localStorage.getItem("invoicer_invoices")).toBe(after);
  });

  it("seeds templates on an empty install", () => {
    runMigration();
    const templates = JSON.parse(localStorage.getItem("invoicer_templates")!);
    expect(templates).toHaveLength(SEED_TEMPLATES.length);
  });

  it("quarantines raw dropped values when something could not be migrated", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice, "garbage"]));

    runMigration();

    const quarantine = JSON.parse(
      localStorage.getItem("invoicer_migration_quarantine_v2")!,
    );
    expect(quarantine.dropped.invoices).toEqual(["garbage"]);
    expect(typeof quarantine.migratedAt).toBe("string");
  });

  it("does not write a quarantine key when nothing was dropped", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));

    runMigration();

    expect(localStorage.getItem("invoicer_migration_quarantine_v2")).toBeNull();
  });

  it("does not overwrite a pre-existing quarantine key on a later run", () => {
    const earlierRescue = { migratedAt: "2026-01-01T00:00:00.000Z", dropped: { brands: ["earlier"], clients: [], invoices: [] } };
    localStorage.setItem("invoicer_migration_quarantine_v2", JSON.stringify(earlierRescue));
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice, "garbage"]));

    runMigration();

    const quarantine = JSON.parse(
      localStorage.getItem("invoicer_migration_quarantine_v2")!,
    );
    expect(quarantine).toEqual(earlierRescue);
  });
});
