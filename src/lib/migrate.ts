import { paletteColorForIndex } from "./palette";
import { SEED_TEMPLATES, defaultFollowupConfig } from "./seed";
import type { Brand, BrandSnapshot, Client, EmailTemplate, Invoice } from "./types";

export const SCHEMA_VERSION = 2;

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";
const TEMPLATES_KEY = "invoicer_templates";
const VERSION_KEY = "invoicer_schema_version";
const QUARANTINE_KEY = "invoicer_migration_quarantine_v2";

export interface V2Payload {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
  templates: EmailTemplate[];
  /** Raw elements that could not be migrated, kept verbatim for manual recovery. */
  dropped: {
    brands: unknown[];
    clients: unknown[];
    invoices: unknown[];
  };
}

interface RawPayload {
  brands: unknown[];
  clients: unknown[];
  invoices: unknown[];
  templates: unknown[];
}

function normaliseCompanyName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** A stored record we can actually migrate. Anything else is unsalvageable. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Splits a raw stored array into migratable records and unsalvageable rejects. */
function partitionRecords(values: unknown[]): {
  kept: Record<string, unknown>[];
  dropped: unknown[];
} {
  const kept: Record<string, unknown>[] = [];
  const dropped: unknown[] = [];
  for (const value of values) {
    (isRecord(value) ? kept : dropped).push(value);
  }
  return { kept, dropped };
}

/** Best-effort prefix recovery from a legacy invoice number ("SC2026001" -> "SC"). */
function prefixFromInvoiceNumber(invoiceNumber: string): string {
  const match = /^([^\d-]+)/.exec(invoiceNumber);
  return match ? match[1] : "INV";
}

function snapshotFromBrand(brand: Brand): BrandSnapshot {
  return {
    name: brand.name,
    address: brand.address,
    email: brand.email,
    phone: brand.phone,
    gstNumber: brand.gstNumber,
    panNumber: brand.panNumber,
    logo: brand.logo,
    invoicePrefix: brand.invoicePrefix,
    accentColor: brand.accentColor,
    bankDetails: brand.bankDetails,
  };
}

function fallbackSnapshot(invoiceNumber: string): BrandSnapshot {
  return {
    name: "Unknown brand",
    address: "",
    invoicePrefix: prefixFromInvoiceNumber(invoiceNumber),
    accentColor: paletteColorForIndex(0),
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
  };
}

export function migrateToV2(input: RawPayload): V2Payload {
  // A null, primitive, or array element carries no recoverable data — drop
  // it rather than let it throw and abort migration for every other record.
  // The reject is kept verbatim in `dropped` rather than discarded, so
  // runMigration can quarantine it for manual recovery.
  const brandsPartition = partitionRecords(input.brands);
  const brands = (brandsPartition.kept as unknown as Brand[]).map((brand, index) => ({
    ...brand,
    accentColor: brand.accentColor ?? paletteColorForIndex(index),
    followup: brand.followup ?? defaultFollowupConfig(),
  }));

  const clientsPartition = partitionRecords(input.clients);
  const clients = clientsPartition.kept as unknown as Client[];

  const clientsByCompany = new Map<string, string>();
  for (const client of clients) {
    clientsByCompany.set(normaliseCompanyName(client.companyName), client.id);
  }

  const brandsById = new Map(brands.map((b) => [b.id, b]));

  const invoicesPartition = partitionRecords(input.invoices);
  const invoices = (invoicesPartition.kept as unknown as Invoice[]).map((invoice) => {
    const brand = brandsById.get(invoice.brandId);
    return {
      ...invoice,
      // Legacy invoice numbers are deliberately left alone — they may already
      // be in a client's inbox.
      brandSnapshot:
        invoice.brandSnapshot ??
        (brand ? snapshotFromBrand(brand) : fallbackSnapshot(invoice.invoiceNumber)),
      clientId:
        invoice.clientId ??
        clientsByCompany.get(normaliseCompanyName(invoice.client?.companyName)) ??
        null,
      reminders: invoice.reminders ?? [],
      followupsPaused: invoice.followupsPaused ?? false,
    };
  });

  const existingTemplates = input.templates as EmailTemplate[];
  const templates = existingTemplates.length > 0 ? existingTemplates : [...SEED_TEMPLATES];

  return {
    brands,
    clients,
    invoices,
    templates,
    dropped: {
      brands: brandsPartition.dropped,
      clients: clientsPartition.dropped,
      invoices: invoicesPartition.dropped,
    },
  };
}

function read(key: string): unknown[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Runs once on app boot. Safe to call repeatedly — it exits early once the
 * stored schema version matches.
 */
export function runMigration(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(VERSION_KEY) === String(SCHEMA_VERSION)) return;

  const result = migrateToV2({
    brands: read(BRANDS_KEY),
    clients: read(CLIENTS_KEY),
    invoices: read(INVOICES_KEY),
    templates: read(TEMPLATES_KEY),
  });

  localStorage.setItem(BRANDS_KEY, JSON.stringify(result.brands));
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(result.clients));
  localStorage.setItem(INVOICES_KEY, JSON.stringify(result.invoices));
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(result.templates));
  localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));

  const droppedCounts = {
    brands: result.dropped.brands.length,
    clients: result.dropped.clients.length,
    invoices: result.dropped.invoices.length,
  };
  const totalDropped = droppedCounts.brands + droppedCounts.clients + droppedCounts.invoices;

  if (totalDropped > 0) {
    // Never clobber an earlier rescue — the quarantine key is the only copy
    // of whatever was dropped, so a second bad run must not overwrite it.
    if (localStorage.getItem(QUARANTINE_KEY) === null) {
      localStorage.setItem(
        QUARANTINE_KEY,
        JSON.stringify({ migratedAt: new Date().toISOString(), dropped: result.dropped }),
      );
    }
    console.warn(
      `[migrate] dropped ${droppedCounts.brands} brand(s), ${droppedCounts.clients} client(s), ` +
        `${droppedCounts.invoices} invoice(s) that could not be migrated; raw data preserved under "${QUARANTINE_KEY}"`,
    );
  }
}
