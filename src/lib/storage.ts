import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";

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
// why: the bare form was observed to silently export `undefined` instead of
// the class under vitest. The exact mechanism was not pinned down; a
// circular-import / module-evaluation-order interaction with vitest's
// transform is plausible (see `fake-seam.ts`'s own, confirmed circularity
// with this module) but unconfirmed here — do not treat that as settled.
// What's known is the symptom, and that `export … from` does not exhibit it;
// keep it this way.
export { LogoUploadError } from "./storage-errors";

/**
 * Plan state has moved to Postgres (`org_billing`), so nothing in this file
 * reads `localStorage` any more. The key below is retained only to clean up
 * after the version that did: a stale `invoicer_plan` entry claiming Pro
 * would otherwise sit in browsers forever, meaning nothing, and confuse the
 * next person who opens devtools looking for why a tier looks wrong.
 *
 * `subscribe`/`notify` are gone with it. All five hooks are on TanStack
 * Query now, which does its own change notification.
 */
const LEGACY_PLAN_KEY = "invoicer_plan";

export function clearLegacyPlanKey(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_PLAN_KEY);
  } catch {
    // A browser refusing localStorage entirely is not a reason to fail; the
    // key it would have held is already ignored.
  }
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

/**
 * The org's plan, from Postgres.
 *
 * This used to read `localStorage`, which meant a browser could grant itself
 * Pro. That was harmless while the tier gated nothing but an upsell dialog,
 * and stopped being harmless the moment the email quota started depending on
 * it. `org_billing` is now the only answer.
 *
 * Returns the free tier rather than throwing when there is no row: the plan
 * decorates a sidebar card, and a workspace with a missing billing row should
 * render as free rather than blank the screen. The *quota* takes the opposite
 * view and refuses to send at all, because the safe direction differs — see
 * `private.enforce_email_quota`.
 */
export async function getPlan(): Promise<PlanState> {
  const { data, error } = await createClient()
    .from("org_billing")
    .select("tier, renews_on")
    .maybeSingle();
  throwOn(error);
  if (!data) return { tier: "free", renewsOn: null };
  return {
    tier: (data.tier as PlanState["tier"]) ?? "free",
    renewsOn: (data.renews_on as string | null) ?? null,
  };
}

/**
 * MOCK: still no payment provider — see TODO(payment-provider) in
 * `hooks/use-plan.ts`. What changed is where the flag lives: a tier a browser
 * could write is a tier every browser can grant itself, so `org_billing` has
 * no client write policy and this goes through a server route that will one
 * day be a provider webhook instead.
 */
export async function setPlanTier(tier: PlanState["tier"]): Promise<PlanState> {
  const response = await fetch("/api/billing/tier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not change the plan");
  }
  return (await response.json()) as PlanState;
}

export interface EmailQuota {
  tier: string;
  tierLabel: string;
  monthlyLimit: number;
  used: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  overLimit: boolean;
}

/**
 * How much of this month's email allowance is left.
 *
 * Goes through the `email_quota()` RPC rather than counting rows here, so the
 * figure a user reads and the figure the trigger enforces come from the same
 * expression. Two implementations would eventually show somebody "38
 * remaining" over a refusal to send.
 */
export async function getEmailQuota(): Promise<EmailQuota | null> {
  const { data, error } = await createClient().rpc("email_quota");
  throwOn(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tier: row.tier as string,
    tierLabel: row.tier_label as string,
    monthlyLimit: row.monthly_limit as number,
    used: row.used as number,
    remaining: row.remaining as number,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    overLimit: row.over_limit as boolean,
  };
}

export interface ReminderSendRecord {
  id: string;
  stage: "nudge" | "followup" | "final" | "manual" | "legacy";
  ordinal: number;
  status: "queued" | "sent" | "failed" | "blocked" | "recorded";
  toEmail: string;
  subject: string;
  body: string;
  error: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
}

/**
 * Everything ever attempted for one invoice, oldest first — including the
 * attempts that were blocked or failed, which are the ones a user most needs
 * to see. A history that showed only successes would answer "what went out"
 * while hiding "why nothing did".
 */
export async function getReminderSends(invoiceId: string): Promise<ReminderSendRecord[]> {
  const { data, error } = await createClient()
    .from("reminder_sends")
    .select(
      "id, stage, ordinal, status, to_email, subject, body, error, scheduled_for, sent_at, created_at"
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  throwOn(error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    stage: row.stage as ReminderSendRecord["stage"],
    ordinal: row.ordinal as number,
    status: row.status as ReminderSendRecord["status"],
    toEmail: (row.to_email as string) ?? "",
    subject: (row.subject as string) ?? "",
    body: (row.body as string) ?? "",
    error: (row.error as string | null) ?? null,
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

/** Send one manual chase now. Server-side, because only a server may send. */
export async function sendManualChase(invoiceId: string): Promise<void> {
  const response = await fetch("/api/reminders/chase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not send that reminder");
  }
}

