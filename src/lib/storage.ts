import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";
import {
  forceMigration as forceMigrationInternal,
  runMigration as runMigrationInternal,
} from "./migrate";
import { writeLocalStorage } from "./local-storage";

export { nextInvoiceNumber } from "./numbering";

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";
const TEMPLATES_KEY = "invoicer_templates";
const PLAN_KEY = "invoicer_plan";

/**
 * Same hardening as `migrate.ts`'s own `read()` — unguarded, this fed
 * `getSnapshot`, which is `useSyncExternalStore`'s snapshot function. A
 * corrupt value (tampered with, or corrupted after `VERSION_KEY` was
 * written, which the migration never revisits) threw straight out of a
 * render with no error boundary anywhere in the tree: a white screen on
 * every route, unrecoverable without devtools.
 */
function getItem<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(key);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns whether the write actually persisted. Every `save*`/`delete*`
 * below returns this straight through (and every hook in `src/hooks`
 * already passes it through too, since each just wraps the matching storage
 * call as a single-expression arrow function) — a caller that never checks
 * it loses nothing (this used to be `void`), but one that does, like
 * `BrandForm.handleSubmit`, can avoid telling the user their save succeeded
 * and navigating away from data that was never actually written.
 */
function setItem<T>(key: string, data: T[]): boolean {
  // A failed write must not invalidate the cache — the last snapshot is
  // still what's actually persisted, and re-notifying subscribers with it
  // unchanged is harmless, but dropping the cache (forcing every reader
  // back to `localStorage.getItem`, which still holds the old value anyway)
  // buys nothing and only risks a subscriber re-rendering mid-failure.
  if (!writeLocalStorage(key, JSON.stringify(data))) return false;
  invalidate(key);
  return true;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function handleStorageEvent(): void {
  snapshots.clear();
  planSnapshot = null;
  notify();
}

/**
 * Subscribe to local mutations and to writes from other tabs.
 *
 * The "storage" window event is only ever dispatched by other tabs/windows
 * (same-tab writes never fire it), so it is wired through a single shared
 * handler rather than the per-call `listener` reference — that handler
 * clears the snapshot cache before rebroadcasting to every subscriber, and
 * is attached/removed exactly once regardless of how many hooks subscribe.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("storage", handleStorageEvent);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const EMPTY: never[] = [];
const snapshots = new Map<string, unknown[]>();

function getSnapshot<T>(key: string): T[] {
  if (!snapshots.has(key)) {
    snapshots.set(key, typeof window === "undefined" ? EMPTY : getItem<T>(key));
  }
  return snapshots.get(key) as T[];
}

function invalidate(key: string): void {
  snapshots.delete(key);
  notify();
}

/**
 * Runs the v1→v2 migration and clears every cached snapshot afterwards.
 *
 * `migrate.ts` writes the four data keys straight through `localStorage`,
 * bypassing `setItem`/`invalidate` entirely (and must keep doing so — it
 * cannot import this module, since this module already imports it). Without
 * this wrapper, a hook that reads its snapshot during the same first render
 * `Shell`'s `useEffect(() => runMigration())` runs in would cache
 * pre-migration data, and nothing would ever tell that cache slot to drop
 * it — the UI would keep serving pre-migration records (brands missing
 * `accentColor`/`followup`, invoices missing `brandSnapshot`/`reminders`)
 * for the rest of the session. Clearing the whole cache — not just the
 * cache for a key we'd have to guess — makes invalidation the migration's
 * own responsibility rather than every caller's.
 */
export function runMigration(): void {
  runMigrationInternal();
  snapshots.clear();
  planSnapshot = null;
  notify();
}

/**
 * Same cache-invalidation wrapper as `runMigration` above, but around
 * `forceMigration` — used by `import-export.tsx` after writing an imported
 * file straight to the four data keys (bypassing `setItem`/`invalidate`,
 * same as every other direct `localStorage` write `migrate.ts` makes). An
 * import can reintroduce v1-shaped invoices into an install whose schema
 * version is already current, which is exactly the case `runMigration`
 * itself deliberately no-ops on — without this wrapper, both the forced
 * migration *and* the stale-cache problem `runMigration`'s own wrapper
 * exists to prevent would go unhandled for imported data.
 */
export function forceMigration(): void {
  forceMigrationInternal();
  snapshots.clear();
  planSnapshot = null;
  notify();
}

export function getBrandsSnapshot(): Brand[] {
  return getSnapshot<Brand>(BRANDS_KEY);
}

export function getClientsSnapshot(): Client[] {
  return getSnapshot<Client>(CLIENTS_KEY);
}

// Returns whether the write actually persisted. `localStorage.setItem` can
// throw (most commonly `QuotaExceededError`) and a full-backup restore is
// the largest write this app ever makes — the likeliest place to hit that
// limit. Callers that need to report an honest result (the importer) check
// this; existing callers that ignore the return value behave exactly as
// before.
function setItem<T>(key: string, data: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error(`Failed to persist ${key} to localStorage`, err);
    return false;
  }
}

// Brands
export function getBrands(): Brand[] {
  return getItem<Brand>(BRANDS_KEY);
}

export function getBrand(id: string): Brand | null {
  return getBrands().find((b) => b.id === id) ?? null;
}

export function saveBrand(brand: Brand): boolean {
  const brands = getBrands();
  const index = brands.findIndex((b) => b.id === brand.id);
  if (index >= 0) {
    brands[index] = brand;
  } else {
    brands.push(brand);
  }
  return setItem(BRANDS_KEY, brands);
}

export function deleteBrand(id: string): boolean {
  return setItem(
    BRANDS_KEY,
    getBrands().filter((b) => b.id !== id)
  );
}

// Clients
export function getClients(): Client[] {
  return getItem<Client>(CLIENTS_KEY);
}

export function getClient(id: string): Client | null {
  return getClients().find((c) => c.id === id) ?? null;
}

export function saveClient(client: Client): boolean {
  const clients = getClients();
  const index = clients.findIndex((c) => c.id === client.id);
  if (index >= 0) {
    clients[index] = client;
  } else {
    clients.push(client);
  }
  return setItem(CLIENTS_KEY, clients);
}

export function deleteClient(id: string): boolean {
  return setItem(
    CLIENTS_KEY,
    getClients().filter((c) => c.id !== id)
  );
}

// Invoices
export function getInvoices(): Invoice[] {
  return getItem<Invoice>(INVOICES_KEY);
}

export function getInvoice(id: string): Invoice | null {
  return getInvoices().find((i) => i.id === id) ?? null;
}

export function saveInvoice(invoice: Invoice): boolean {
  const invoices = getInvoices();
  const index = invoices.findIndex((i) => i.id === invoice.id);
  if (index >= 0) {
    invoices[index] = invoice;
  } else {
    invoices.push(invoice);
  }
  return setItem(INVOICES_KEY, invoices);
}

export function deleteInvoice(id: string): boolean {
  return setItem(
    INVOICES_KEY,
    getInvoices().filter((i) => i.id !== id)
  );
}

// Templates
export function getTemplates(): EmailTemplate[] {
  return getItem<EmailTemplate>(TEMPLATES_KEY);
}

export function saveTemplate(template: EmailTemplate): boolean {
  const templates = getTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  return setItem(TEMPLATES_KEY, templates);
}

export function deleteTemplate(id: string): boolean {
  return setItem(
    TEMPLATES_KEY,
    getTemplates().filter((t) => t.id !== id)
  );
}

// MOCK: plan state is local-only. There is no billing integration.
export function savePlan(plan: PlanState): boolean {
  if (!writeLocalStorage(PLAN_KEY, JSON.stringify(plan))) return false;
  invalidatePlan();
  return true;
}

