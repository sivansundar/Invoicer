import type { Brand, Client, EmailTemplate, Invoice } from "./types";

/**
 * Rewrites ids in an imported backup that Postgres will not accept.
 *
 * Every id column is `uuid`. A backup exported by the pre-Postgres app is
 * mostly fine — brands, clients and invoices were created with
 * `crypto.randomUUID()` — but the three seeded email templates carried
 * hand-written ids (`tpl-gentle-nudge`, `tpl-second-reminder`,
 * `tpl-final-notice`), and a hand-edited file can carry anything at all.
 * Inserting one of those is rejected outright, so restoring an old backup
 * would fail on its templates and on every brand that referenced one.
 *
 * Rewriting an id is safe because nothing outside the file depends on it —
 * ids were never shown to a user or printed on an invoice. What must not
 * break is the references *inside* the file, which is the whole job here:
 * a remapped template id has to follow through to every brand's
 * `followup.templateId`, and a remapped brand or client id through to every
 * invoice that points at it.
 *
 * Validation deliberately does not do this. `import-validation.ts` asks
 * whether a record can be rendered; this asks whether it can be stored.
 */

// Accepts any RFC 4122 variant, and the nil uuid, because that is exactly
// the set Postgres' `uuid` type accepts — being stricter here would reject
// rows the database would have taken.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface BackupCollections {
  brands: Brand[];
  clients: Client[];
  templates: EmailTemplate[];
  invoices: Invoice[];
}

export interface RemapResult {
  collections: BackupCollections;
  /** How many ids were rewritten, for the import summary. */
  remapped: number;
}

/** Assigns a fresh uuid to every record whose id is not one, keeping a map old → new. */
function remapCollection<T extends { id: string }>(
  records: T[],
  mapping: Map<string, string>
): T[] {
  return records.map((record) => {
    if (isUuid(record.id)) return record;
    const replacement = crypto.randomUUID();
    mapping.set(record.id, replacement);
    return { ...record, id: replacement };
  });
}

export function remapNonUuidIds(collections: BackupCollections): RemapResult {
  const templateIds = new Map<string, string>();
  const brandIds = new Map<string, string>();
  const clientIds = new Map<string, string>();
  const invoiceIds = new Map<string, string>();

  const templates = remapCollection(collections.templates, templateIds);
  const clients = remapCollection(collections.clients, clientIds);

  const brands = remapCollection(collections.brands, brandIds).map((brand) => {
    const current = brand.followup.templateId;
    if (!current) return brand;

    const replacement = templateIds.get(current);
    if (replacement) {
      return { ...brand, followup: { ...brand.followup, templateId: replacement } };
    }
    // Points at something that is neither a uuid nor a template in this file
    // — a reference that was already dangling before the export. Cleared
    // rather than carried, so it cannot be mistaken later for a template
    // that was lost in the restore.
    if (!isUuid(current)) {
      return { ...brand, followup: { ...brand.followup, templateId: "" } };
    }
    return brand;
  });

  const invoices = remapCollection(collections.invoices, invoiceIds).map((invoice) => {
    const brandId = brandIds.get(invoice.brandId) ?? invoice.brandId;
    const clientId =
      invoice.clientId === null ? null : clientIds.get(invoice.clientId) ?? invoice.clientId;

    if (brandId === invoice.brandId && clientId === invoice.clientId) return invoice;
    return { ...invoice, brandId, clientId };
  });

  return {
    collections: { brands, clients, templates, invoices },
    remapped: templateIds.size + brandIds.size + clientIds.size + invoiceIds.size,
  };
}
