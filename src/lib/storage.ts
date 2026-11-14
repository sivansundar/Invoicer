import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";
import {
  forceMigration as forceMigrationInternal,
  runMigration as runMigrationInternal,
} from "./migrate";
import { writeLocalStorage } from "./local-storage";
import { send } from "./api";

export { nextInvoiceNumber } from "./numbering";

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

export function getTemplatesSnapshot(): EmailTemplate[] {
  return getSnapshot<EmailTemplate>(TEMPLATES_KEY);
}

// Plan state is a single object, not a collection, so it gets its own
// one-slot cache rather than sharing `snapshots` — same requirement though:
// `JSON.parse` (inside `readPlan`) returns a fresh object every call, and
// wiring that directly into `useSyncExternalStore` would infinite-loop
// exactly like an uncached array would.
const EMPTY_PLAN: PlanState = { tier: "free", renewsOn: null };
let planSnapshot: PlanState | null = null;

function readPlan(): PlanState {
  if (typeof window === "undefined") return EMPTY_PLAN;
  const raw = localStorage.getItem(PLAN_KEY);
  if (!raw) return EMPTY_PLAN;
  try {
    return JSON.parse(raw) as PlanState;
  } catch {
    return EMPTY_PLAN;
  }
}

export function getPlanSnapshot(): PlanState {
  if (planSnapshot === null) {
    planSnapshot = readPlan();
  }
  return planSnapshot;
}

function invalidatePlan(): void {
  planSnapshot = null;
  notify();
}

// Brands, clients and invoices live on the server. This module keeps the
// signed-in user's copy in memory: `hydrate` fills it once from the data the
// root layout loaded, reads are synchronous, and a save shows up here at once
// and is taken back if the server refuses it.
type ServerKind = "brands" | "clients" | "invoices";
export type Level = "none" | "view" | "edit";
export type BrandPermissions = { invoices: Level; expenses: Level };
type ServerData = {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
  /** Brands shared with the user, by id. A brand they own has no entry. */
  permissions?: Record<string, BrandPermissions>;
};

const NO_PERMISSIONS: Record<string, BrandPermissions> = {};
let permissions = NO_PERMISSIONS;
export const getPermissionsSnapshot = (): Record<string, BrandPermissions> => permissions;

const server: Required<Omit<ServerData, "permissions">> = { brands: EMPTY, clients: EMPTY, invoices: EMPTY };

/**
 * `announce: false` is for calling during a React render, where telling
 * already-mounted subscribers to update is not allowed; follow it with a
 * plain `hydrate(data)` from an effect.
 */
export function hydrate(data: ServerData, announce = true): void {
  // Never on the server: this module's state would be shared across requests.
  if (typeof window === "undefined") return;
  server.brands = data.brands;
  server.clients = data.clients;
  server.invoices = data.invoices;
  permissions = data.permissions ?? NO_PERMISSIONS;
  if (announce) notify();
}

function put<T extends { id: string }>(kind: ServerKind, record: T): void {
  const list = server[kind] as unknown as T[];
  const index = list.findIndex((r) => r.id === record.id);
  const next = index >= 0 ? list.map((r, i) => (i === index ? record : r)) : [...list, record];
  (server[kind] as unknown) = next;
  notify();
}

function drop(kind: ServerKind, id: string): void {
  (server[kind] as unknown) = (server[kind] as { id: string }[]).filter((r) => r.id !== id);
  notify();
}

/**
 * Resolves to whether the server accepted the write, so a caller can hold
 * its "saved" message and navigation until it has.
 */
// shortcut: a failed save restores the record as it was before *this* save,
// which is wrong if a second save of the same record landed in between.
// Upgrade to per-record versions if saves ever overlap in practice.
function save<T extends { id: string }>(kind: ServerKind, record: T): Promise<boolean> {
  const before = (server[kind] as unknown as T[]).find((r) => r.id === record.id);
  put(kind, record);
  return send("PUT", `${kind}/${encodeURIComponent(record.id)}`, record).then((ok) => {
    if (!ok) {
      if (before) put(kind, before);
      else drop(kind, record.id);
    }
    return ok;
  });
}

function remove(kind: ServerKind, id: string): Promise<boolean> {
  const before = (server[kind] as { id: string }[]).find((r) => r.id === id);
  drop(kind, id);
  return send("DELETE", `${kind}/${encodeURIComponent(id)}`).then((ok) => {
    if (!ok && before) put(kind, before);
    return ok;
  });
}

export const getBrandsSnapshot = (): Brand[] => server.brands;
export const getClientsSnapshot = (): Client[] => server.clients;
export const getInvoicesSnapshot = (): Invoice[] => server.invoices;

export const getBrands = getBrandsSnapshot;
export const getBrand = (id: string): Brand | null => server.brands.find((b) => b.id === id) ?? null;
export const saveBrand = (brand: Brand): Promise<boolean> => save("brands", brand);
export const deleteBrand = (id: string): Promise<boolean> => remove("brands", id);

export const getClients = getClientsSnapshot;
export const getClient = (id: string): Client | null => server.clients.find((c) => c.id === id) ?? null;
export const saveClient = (client: Client): Promise<boolean> => save("clients", client);
export const deleteClient = (id: string): Promise<boolean> => remove("clients", id);

export const getInvoices = getInvoicesSnapshot;
export const getInvoice = (id: string): Invoice | null => server.invoices.find((i) => i.id === id) ?? null;
export const saveInvoice = (invoice: Invoice): Promise<boolean> => save("invoices", invoice);
export const deleteInvoice = (id: string): Promise<boolean> => remove("invoices", id);

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

