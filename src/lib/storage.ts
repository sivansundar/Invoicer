import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";
import { writeLocalStorage } from "./local-storage";
import { createClient } from "./supabase/client";
import { dataUrlToBytes, logoObjectPath, sha256Hex } from "./logo-storage";
import { LogoUploadError } from "./storage-errors";
import {
  brandToRow,
  clientToRow,
  invoiceToPayload,
  rowToBrand,
  rowToClient,
  rowToInvoice,
  rowToTemplate,
  templateToRow,
  type BrandRow,
  type ClientRow,
  type EmailTemplateRow,
  type InvoiceRow,
} from "./supabase/mappers";

export { nextInvoiceNumber } from "./numbering";
// `export … from` rather than a bare `export { LogoUploadError };` after the
// `import` above — see the equivalent re-export in `@/test/fake-seam.ts` for
// why: the bare form was observed to silently export `undefined` once a
// nearby doc comment grew past a certain length (a transform-pipeline quirk,
// unrelated to `vi.mock`). `export … from` did not exhibit it.
export { LogoUploadError } from "./storage-errors";

// Plan state is the last thing still in localStorage, and stays there by
// design: it is a mock with no billing integration and no schema behind it.
const PLAN_KEY = "invoicer_plan";

/**
 * Plan state is the only thing left in localStorage — everything else lives
 * in Postgres. It stays local because it is a mock: there is no billing
 * integration and no schema behind it (see the Phase 2 plan, Decisions §2).
 *
 * `subscribe`/`notify` remain for the same reason. `use-plan` is the one
 * hook still on `useSyncExternalStore`; the other four moved to TanStack
 * Query, which does its own change notification.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

function handleStorageEvent(): void {
  planSnapshot = null;
  notify();
}

/**
 * Subscribe to plan changes, including from other tabs.
 *
 * The "storage" window event is only ever dispatched by other tabs/windows
 * (same-tab writes never fire it), so it is wired through a single shared
 * handler rather than the per-call `listener` reference — that handler drops
 * the cached snapshot before rebroadcasting to every subscriber, and is
 * attached/removed exactly once regardless of how many hooks subscribe.
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

/**
 * Saves a brand, uploading a freshly-picked logo along the way.
 *
 * This is TWO writes, not one, and they are not transactional — Postgres
 * and Storage are separate systems here, so there is no rollback if the
 * second one fails. That is a deliberate trade-off, not an oversight:
 *
 * 1. The whole row (every field the caller passed, including a fresh data
 *    URL verbatim in `logo_data`) is upserted FIRST. It has to be: the
 *    bucket's INSERT policy is `exists (select 1 from public.brands where
 *    id = ...)`, and a brand's id is generated client-side
 *    (`crypto.randomUUID()`) before any row exists for it. Uploading before
 *    this write — which is what an earlier draft of this function did —
 *    means the very first save of a brand-new logo always fails RLS, since
 *    the row it would check for does not exist yet. There is no ordering
 *    that both satisfies that policy and keeps the two writes atomic; this
 *    is the least-bad option, not the ideal one.
 * 2. Only once that row exists does the upload happen, followed by a
 *    second, narrow write that swaps `logo_data` for `logo_path`.
 *
 * The consequence: if step 2 throws — upload failure, network drop, RLS on
 * the second write — this function still rejects (nothing here swallows an
 * error), but step 1 already committed. Every other field the caller
 * changed in the same call (address, phone, bank details, ...) is durably
 * saved even though the promise the caller is awaiting rejects. A caller
 * that reads "the promise rejected" as "nothing changed" is wrong about
 * everything except the logo.
 *
 * That specific exception — the logo — is the one deliberately-kept
 * fallback: because step 1 writes the fresh data URL into `logo_data`
 * as-is, a brand whose step 2 fails is left rendering from that base64
 * rather than with no logo at all, even though the rest of Phase 3 is
 * about removing base64 from that column. It stays there, unmigrated,
 * until the next successful save re-attempts the upload. See
 * `src/test/integration/seam.test.ts`, "commits the row's other edited
 * fields even when the logo upload step fails afterward", for what this
 * looks like from a caller's side.
 */
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
  let result = rowToBrand(data as BrandRow);

  // A `logo` that is a data URL is a fresh upload from the form. Convert it
  // to an object and record the path in a second write, so `logo_data`
  // stops accumulating base64 — and so `snapshotFromBrand` freezes a path
  // onto every invoice issued from here on.
  //
  // Deliberately NOT clearing `logo_data` for brands that still have one and
  // no new upload: that column is what those brands render from until their
  // owner next touches the logo. Task 9 records the residue.
  if (brand.logo?.startsWith("data:")) {
    try {
      const logoPath = await uploadBrandLogo(result.id, brand.logo);
      const { data: updated, error: updateError } = await createClient()
        .from("brands")
        .update({ logo_path: logoPath, logo_data: null })
        .eq("id", result.id)
        .select("*")
        .single();
      throwOn(updateError);
      result = rowToBrand(updated as BrandRow);
    } catch (err) {
      // `result` is the row the first write already committed. Rethrowing
      // bare would lose that fact — see the class comment.
      throw new LogoUploadError(result, err);
    }
  }

  return result;
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await createClient().from("brands").delete().eq("id", id);
  throwOn(error);
}

const LOGO_BUCKET = "brand-logos";

/** How long a signed logo URL is valid. Paired with a shorter `staleTime` in
 *  `useLogoSrc` so a URL is refetched before it expires on screen. */
export const LOGO_URL_TTL_SECONDS = 3600;

/**
 * Uploads a logo and returns its object path.
 *
 * Content-addressed, so uploading the same image twice is idempotent and
 * lands on the same path — `upsert` makes that a no-op write rather than a
 * conflict, which is why the bucket needs an UPDATE policy as well as
 * INSERT.
 */
export async function uploadBrandLogo(brandId: string, dataUrl: string): Promise<string> {
  const bytes = dataUrlToBytes(dataUrl);
  const path = logoObjectPath(brandId, await sha256Hex(bytes));

  const { error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .upload(path, bytes as BufferSource, { contentType: "image/png", upsert: true });
  throwOn(error);
  return path;
}

/** A signed URL for a logo object. The bucket is private; there is no public URL. */
export async function getLogoUrl(path: string): Promise<string> {
  const { data, error } = await createClient()
    .storage.from(LOGO_BUCKET)
    .createSignedUrl(path, LOGO_URL_TTL_SECONDS);
  throwOn(error);
  return data!.signedUrl;
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
//
// Reads embed `invoice_items` in one round trip rather than a second query
// per invoice; the mapper sorts them by `position`, because PostgREST makes
// no promise about the order of embedded rows and line-item order is what
// prints on the document.
const INVOICE_SELECT = "*, invoice_items(*)";

export async function getInvoices(): Promise<Invoice[]> {
  const { data, error } = await createClient()
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("created_at", { ascending: true });
  throwOn(error);
  return (data as InvoiceRow[]).map(rowToInvoice);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await createClient()
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwOn(error);
  return data ? rowToInvoice(data as InvoiceRow) : null;
}

/**
 * Creates an invoice, letting the server allocate its number.
 *
 * Separate from `saveInvoice` rather than dispatched inside it: telling a
 * create from an update needs to know whether the row already exists, which
 * the seam cannot answer without an extra round trip — and guessing wrong
 * either renumbers a sent invoice or fails an edit. The two callers that
 * create (the invoice form and the importer) both know which they are doing.
 *
 * The returned invoice carries the number the server actually issued, which
 * is not necessarily the provisional one the form displayed while drafting.
 * Callers must show this one.
 */
export async function createInvoice(
  invoice: Invoice,
  options: { preserveNumber?: boolean } = {}
): Promise<Invoice> {
  const { data, error } = await createClient().rpc("create_invoice", {
    payload: invoiceToPayload(invoice, options),
  });
  throwOn(error);
  return rowToInvoice(data as InvoiceRow);
}

/**
 * Updates an existing invoice. Never touches its number — a number, once
 * issued, names a document that may already be in somebody's inbox.
 */
export async function saveInvoice(invoice: Invoice): Promise<Invoice> {
  const { data, error } = await createClient().rpc("update_invoice", {
    payload: invoiceToPayload(invoice),
  });
  throwOn(error);
  return rowToInvoice(data as InvoiceRow);
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await createClient().from("invoices").delete().eq("id", id);
  throwOn(error);
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

