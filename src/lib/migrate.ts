import { paletteColorForIndex } from "./palette";
import { SEED_TEMPLATES, defaultFollowupConfig } from "./seed";
import { writeLocalStorage } from "./local-storage";
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

interface QuarantineBatch {
  migratedAt: string;
  dropped: { brands: unknown[]; clients: unknown[]; invoices: unknown[] };
}

interface QuarantineStore {
  version: 1;
  batches: QuarantineBatch[];
}

function isQuarantineStore(value: unknown): value is QuarantineStore {
  return isRecord(value) && value.version === 1 && Array.isArray(value.batches);
}

/**
 * Reads the existing quarantine store, tolerating a missing, unparseable, or
 * unexpectedly-shaped value by starting fresh — a corrupt quarantine key
 * must never prevent this run's corruption from being recorded.
 */
function readQuarantineStore(): QuarantineStore {
  const raw = localStorage.getItem(QUARANTINE_KEY);
  if (!raw) return { version: 1, batches: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    return isQuarantineStore(parsed) ? parsed : { version: 1, batches: [] };
  } catch {
    return { version: 1, batches: [] };
  }
}

/** Best-effort prefix recovery from a legacy invoice number ("SC2026001" -> "SC"). */
function prefixFromInvoiceNumber(invoiceNumber: string): string {
  const match = /^([^\d-]+)/.exec(invoiceNumber);
  return match ? match[1] : "INV";
}

/**
 * Freezes a `Brand` into the `BrandSnapshot` embedded on an invoice at
 * creation time. Shared by the v1→v2 migration and the invoice form —
 * duplicating this mapping is exactly how a brand field ends up on one but
 * not the other, and the invoice form is the one place a client's PDF
 * actually depends on it being complete.
 */
export function snapshotFromBrand(brand: Brand): BrandSnapshot {
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
      // A stale payment date on an invoice that isn't (or is no longer)
      // "paid" is worse than no date at all — see `paid-on.ts` and
      // `chart.ts`'s `monthlyPaidSeries`. Deliberately NOT backfilled for a
      // "paid" invoice that has none: its real payment date is unknown, and
      // fabricating one would make the data look more precise than it is.
      paidOn: invoice.status === "paid" ? invoice.paidOn : undefined,
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

/**
 * A whole localStorage key that failed to parse as an array — corrupt JSON,
 * or valid JSON that isn't an array. Distinct from an element-level reject
 * (`partitionRecords`'s `dropped`, one bad record among otherwise-good
 * ones): this is the *entire* collection, and the raw string is the only
 * copy of whatever it held. Kept verbatim in the same quarantine batch as
 * element-level rejects rather than being silently written over with `[]`
 * — on a device with no server and no backup, that would be destroying
 * what may have been a real issued invoice with no way to recover it.
 */
interface WholeKeyCorruption {
  wholeKeyCorruption: true;
  raw: string;
}

interface KeyRead {
  values: unknown[];
  /** Set only when the stored value didn't parse as an array at all. */
  corruption: WholeKeyCorruption | null;
}

function read(key: string): KeyRead {
  const raw = localStorage.getItem(key);
  if (!raw) return { values: [], corruption: null };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { values: parsed, corruption: null };
    return { values: [], corruption: { wholeKeyCorruption: true, raw } };
  } catch {
    return { values: [], corruption: { wholeKeyCorruption: true, raw } };
  }
}

/**
 * Runs once on app boot. Safe to call repeatedly — it exits early once the
 * stored schema version matches.
 */
export function runMigration(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(VERSION_KEY) === String(SCHEMA_VERSION)) return;

  const brandsRead = read(BRANDS_KEY);
  const clientsRead = read(CLIENTS_KEY);
  const invoicesRead = read(INVOICES_KEY);
  const templatesRead = read(TEMPLATES_KEY);

  const result = migrateToV2({
    brands: brandsRead.values,
    clients: clientsRead.values,
    invoices: invoicesRead.values,
    templates: templatesRead.values,
  });

  // A whole-key parse failure loses an entire collection, not just one bad
  // element — captured here (before `collectionWrites` below overwrites the
  // key with `[]`) and routed into the same quarantine batch as
  // element-level rejects, so `totalDropped`/the quarantine write further
  // down pick it up automatically. `read()` itself already ran before any
  // write this function makes, so the raw string is safely in memory by
  // this point regardless of what happens to the stored key next.
  if (brandsRead.corruption) result.dropped.brands.push(brandsRead.corruption);
  if (clientsRead.corruption) result.dropped.clients.push(clientsRead.corruption);
  if (invoicesRead.corruption) result.dropped.invoices.push(invoicesRead.corruption);

  // Collections first, `VERSION_KEY` last, and stop at the first failure —
  // that ordering makes an interrupted migration self-healing on retry.
  // `migrateToV2` is idempotent (proven by the idempotence test in
  // migrate.test.ts), so a boot that only got partway through before hitting
  // a full quota can safely re-run this whole function from scratch next
  // time: whatever already got written stays as-is (its fields are already
  // populated, so the `??` fallbacks throughout `migrateToV2` leave it
  // alone), and whatever didn't gets attempted again. `writeLocalStorage`
  // has already toasted the quota failure by the time any of these return
  // `false` — nothing more to surface here. `VERSION_KEY` is deliberately
  // never written when this happens: a migration marked complete over a
  // partial write would never be retried, silently leaving some records
  // stuck pre-migration forever.
  const collectionWrites: Array<[string, unknown]> = [
    [BRANDS_KEY, result.brands],
    [CLIENTS_KEY, result.clients],
    [INVOICES_KEY, result.invoices],
    [TEMPLATES_KEY, result.templates],
  ];
  for (const [key, value] of collectionWrites) {
    if (!writeLocalStorage(key, JSON.stringify(value))) return;
  }
  if (!writeLocalStorage(VERSION_KEY, String(SCHEMA_VERSION))) return;

  const droppedCounts = {
    brands: result.dropped.brands.length,
    clients: result.dropped.clients.length,
    invoices: result.dropped.invoices.length,
  };
  const totalDropped = droppedCounts.brands + droppedCounts.clients + droppedCounts.invoices;

  if (totalDropped > 0) {
    const summary =
      `dropped ${droppedCounts.brands} brand(s), ${droppedCounts.clients} client(s), ` +
      `${droppedCounts.invoices} invoice(s) that could not be migrated this run`;

    // Quarantine is best-effort and strictly additive to the migration that
    // has already committed above (primary keys + version first, quarantine
    // last — that ordering must not change). A failure here — a corrupt
    // existing value, a full quota — must never break the boot path this
    // mechanism exists to protect.
    try {
      const store = readQuarantineStore();
      store.batches.push({ migratedAt: new Date().toISOString(), dropped: result.dropped });
      localStorage.setItem(QUARANTINE_KEY, JSON.stringify(store));
      console.warn(
        `[migrate] ${summary}; preserved under "${QUARANTINE_KEY}" (${store.batches.length} batch(es) recorded)`,
      );
    } catch {
      console.warn(`[migrate] ${summary}; failed to preserve them under "${QUARANTINE_KEY}"`);
    }
  }
}

/**
 * Forces the v1→v2 migration to run even when the stored schema version
 * already matches. `runMigration` exits early in that case by design — but
 * an imported file (`import-export.tsx`) can reintroduce v1-shaped invoices
 * (missing `brandSnapshot`/`clientId`/`reminders`/`followupsPaused`) into an
 * install that finished migrating long ago, and nothing else re-checks that
 * once `VERSION_KEY` is set. Clearing it first makes `runMigration`'s own
 * idempotent pass over *all* currently-stored records pick the newly
 * imported ones up; already-migrated records pass through unchanged (every
 * field `migrateToV2` fills in uses `??`, never overwriting a value that's
 * already there). If this fails to fully persist, `VERSION_KEY` is left
 * unset by `runMigration` itself, so a later boot retries it exactly like
 * any other partial migration.
 */
export function forceMigration(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(VERSION_KEY);
  runMigration();
}
