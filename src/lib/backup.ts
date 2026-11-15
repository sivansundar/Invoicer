import { migrateToV2, runMigration } from "./migrate";
import type { Brand, Client, EmailTemplate, Invoice } from "./types";

export interface Backup {
  brands: Brand[];
  clients: Client[];
  templates: EmailTemplate[];
  invoices: Invoice[];
}

/** Saves a full backup as `invoicer-backup-<date>.json`, the file Reports → Import reads. */
export function downloadBackup(data: Backup): void {
  const backup = { version: 2, exportedAt: new Date().toISOString(), ...data };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoicer-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readLocal<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Everything this browser saved before Invoicer had accounts, brought up to
 * the current format. It never left the browser, so it is still there for
 * anyone who used the site back then, signed in or not.
 */
export function readLegacyBackup(): Backup {
  runMigration();
  return {
    brands: readLocal<Brand>("invoicer_brands"),
    clients: readLocal<Client>("invoicer_clients"),
    templates: readLocal<EmailTemplate>("invoicer_templates"),
    invoices: readLocal<Invoice>("invoicer_invoices"),
  };
}

/**
 * Brings records from an import file up to the current format before they
 * are saved. A file exported by an old version of the site can hold invoices
 * without a brand snapshot or brands without a design; the server stores
 * what it is given, so the upgrade has to happen here. Records already in
 * the current format come back unchanged.
 */
export function upgradeImported(
  existing: Pick<Backup, "brands" | "clients">,
  incoming: Pick<Backup, "brands" | "clients" | "invoices">
): Pick<Backup, "brands" | "clients" | "invoices"> {
  // Existing brands and clients go in too: an imported invoice may refer to them.
  const migrated = migrateToV2({
    brands: [...existing.brands, ...incoming.brands],
    clients: [...existing.clients, ...incoming.clients],
    invoices: incoming.invoices,
    templates: [],
  });
  const brandIds = new Set(incoming.brands.map((b) => b.id));
  const clientIds = new Set(incoming.clients.map((c) => c.id));
  const existingBrandIds = new Set(existing.brands.map((b) => b.id));
  const existingClientIds = new Set(existing.clients.map((c) => c.id));
  return {
    // An id that already exists is skipped by the import anyway; keep the
    // incoming copy in the list so that skip is still counted.
    brands: migrated.brands.filter((b, i) => brandIds.has(b.id) && (i >= existing.brands.length || !existingBrandIds.has(b.id))),
    clients: migrated.clients.filter((c, i) => clientIds.has(c.id) && (i >= existing.clients.length || !existingClientIds.has(c.id))),
    invoices: migrated.invoices,
  };
}
