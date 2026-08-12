import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";
import {
  forceMigration as forceMigrationInternal,
  runMigration as runMigrationInternal,
} from "./migrate";
import { writeLocalStorage } from "./local-storage";
import { createClient } from "./supabase/client";
import {
  brandToRow,
  clientToRow,
  rowToBrand,
  rowToClient,
  rowToTemplate,
  templateToRow,
  type BrandRow,
  type ClientRow,
  type EmailTemplateRow,
} from "./supabase/mappers";

export { nextInvoiceNumber } from "./numbering";

// Invoices are still localStorage-backed — they move in a later task, with
// the transactional create/update RPCs their numbering depends on. Brands,
// clients and templates already live in Postgres.
const INVOICES_KEY = "invoicer_invoices";
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

export function getInvoicesSnapshot(): Invoice[] {
  return getSnapshot<Invoice>(INVOICES_KEY);
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

/**
 * Every read and write below goes through PostgREST as the signed-in user,
 * so RLS is the only tenancy filter — none of these queries mention
 * `org_id`, and none of them should.
 *
 * They throw on failure rather than returning `false` the way the
 * localStorage implementation did. A rejected promise is the honest signal
 * for a network or policy error, and TanStack Query's mutation `onError`
 * is what turns it back into a toast.
 */
function throwOn(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// Brands
export async function getBrands(): Promise<Brand[]> {
  const { data, error } = await createClient()
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true });
  throwOn(error);
  return (data as BrandRow[]).map(rowToBrand);
}

export async function getBrand(id: string): Promise<Brand | null> {
  const { data, error } = await createClient()
    .from("brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwOn(error);
  return data ? rowToBrand(data as BrandRow) : null;
}

export async function saveBrand(brand: Brand): Promise<Brand> {
  // Upsert rather than insert-or-update: the form generates the id with
  // crypto.randomUUID() before it knows whether this is a create or an
  // edit, so both paths are the same write.
  const { data, error } = await createClient()
    .from("brands")
    .upsert(brandToRow(brand))
    .select("*")
    .single();
  throwOn(error);
  return rowToBrand(data as BrandRow);
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await createClient().from("brands").delete().eq("id", id);
  throwOn(error);
}

// Clients
export async function getClients(): Promise<Client[]> {
  const { data, error } = await createClient()
    .from("clients")
    .select("*")
    .order("created_at", { ascending: true });
  throwOn(error);
  return (data as ClientRow[]).map(rowToClient);
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await createClient()
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwOn(error);
  return data ? rowToClient(data as ClientRow) : null;
}

export async function saveClient(client: Client): Promise<Client> {
  const { data, error } = await createClient()
    .from("clients")
    .upsert(clientToRow(client))
    .select("*")
    .single();
  throwOn(error);
  return rowToClient(data as ClientRow);
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await createClient().from("clients").delete().eq("id", id);
  throwOn(error);
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
export async function getTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await createClient()
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: true });
  throwOn(error);
  return (data as EmailTemplateRow[]).map(rowToTemplate);
}

export async function saveTemplate(template: EmailTemplate): Promise<EmailTemplate> {
  const { data, error } = await createClient()
    .from("email_templates")
    .upsert(templateToRow(template))
    .select("*")
    .single();
  throwOn(error);
  return rowToTemplate(data as EmailTemplateRow);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await createClient().from("email_templates").delete().eq("id", id);
  throwOn(error);
}

// MOCK: plan state is local-only. There is no billing integration.
export function savePlan(plan: PlanState): boolean {
  if (!writeLocalStorage(PLAN_KEY, JSON.stringify(plan))) return false;
  invalidatePlan();
  return true;
}

