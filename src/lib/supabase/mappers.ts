import type {
  BankDetails,
  Brand,
  BrandSnapshot,
  Client,
  Currency,
  EmailTemplate,
  EmailTone,
  FollowupConfig,
  Invoice,
  InvoiceClient,
  InvoiceDesign,
  InvoiceStatus,
  LineItem,
} from "@/lib/types";
import { parseInvoiceNumber } from "@/lib/numbering";

/**
 * The one place row shapes and domain types meet.
 *
 * Postgres columns are snake_case and nullable; the domain types are
 * camelCase and use `undefined` for "absent". Doing that conversion inline at
 * each call site is how a `gst_number` ends up read as `gstNumber` in three
 * places and `gst` in a fourth, so every read and every write goes through
 * here instead.
 */

/** Row shapes as PostgREST returns them. Hand-written; there are no generated types. */
export interface BrandRow {
  id: string;
  name: string;
  address: string;
  email: string | null;
  phone: string | null;
  gst_number: string | null;
  pan_number: string | null;
  logo_data: string | null;
  logo_path: string | null;
  bank_details: BankDetails;
  invoice_prefix: string;
  accent_color: string;
  invoice_design: InvoiceDesign;
  followup: FollowupConfig;
  created_at: string;
}

export interface ClientRow {
  id: string;
  company_name: string;
  name: string | null;
  address: string;
  email: string | null;
  phone: string | null;
  gst_number: string | null;
  created_at: string;
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  tone: EmailTone;
  body: string;
  created_at: string;
}

/**
 * Postgres returns timestamptz with a +00:00 offset and microsecond
 * precision; the domain type is whatever `new Date().toISOString()` produces.
 * Normalising here keeps a value stable across a save/read round trip, which
 * matters because `createdAt` is compared and sorted on.
 */
function toIso(value: string): string {
  return new Date(value).toISOString();
}

/** DB null means "not set"; the domain types spell that `undefined`. */
function orUndefined(value: string | null): string | undefined {
  return value ?? undefined;
}

/** …and back, since PostgREST distinguishes an explicit null from an absent key. */
function orNull(value: string | undefined): string | null {
  return value ?? null;
}

export function rowToBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    email: row.email ?? "",
    phone: orUndefined(row.phone),
    gstNumber: orUndefined(row.gst_number),
    panNumber: orUndefined(row.pan_number),
    logo: orUndefined(row.logo_data),
    logoPath: orUndefined(row.logo_path),
    bankDetails: row.bank_details,
    invoicePrefix: row.invoice_prefix,
    accentColor: row.accent_color,
    invoiceDesign: row.invoice_design,
    followup: row.followup,
    createdAt: toIso(row.created_at),
    // Dead field (see docs/POST-MERGE-NOTES.md): nothing reads it, and it has
    // no column. Kept at 1 only because `Brand` still declares it; removing
    // the field from the type is its own change with its own blast radius.
    nextInvoiceNumber: 1,
  };
}

/**
 * `org_id` is deliberately absent: it is filled by the column default
 * (private.current_org_id) so tenancy is never a value application code
 * chooses. Adding it here would be a bug even when it produced the right
 * answer.
 */
export function brandToRow(brand: Brand): Omit<BrandRow, "created_at"> & { created_at?: string } {
  return {
    id: brand.id,
    name: brand.name,
    address: brand.address,
    email: brand.email ? brand.email : null,
    phone: orNull(brand.phone),
    gst_number: orNull(brand.gstNumber),
    pan_number: orNull(brand.panNumber),
    logo_data: orNull(brand.logo),
    logo_path: orNull(brand.logoPath),
    bank_details: brand.bankDetails,
    invoice_prefix: brand.invoicePrefix,
    accent_color: brand.accentColor,
    invoice_design: brand.invoiceDesign,
    followup: brand.followup,
    created_at: brand.createdAt,
  };
}

export function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    companyName: row.company_name,
    name: orUndefined(row.name),
    address: row.address,
    email: orUndefined(row.email),
    phone: orUndefined(row.phone),
    gstNumber: orUndefined(row.gst_number),
    createdAt: toIso(row.created_at),
  };
}

export function clientToRow(client: Client): ClientRow {
  return {
    id: client.id,
    company_name: client.companyName,
    name: orNull(client.name),
    address: client.address,
    email: orNull(client.email),
    phone: orNull(client.phone),
    gst_number: orNull(client.gstNumber),
    created_at: client.createdAt,
  };
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  position: number;
  description: string;
  amount: number;
  tax: number;
}

export interface InvoiceRow {
  id: string;
  brand_id: string;
  client_id: string | null;
  invoice_number: string;
  number_year: number | null;
  number_seq: number | null;
  status: InvoiceStatus;
  currency: Currency;
  bill_date: string;
  due_date: string;
  paid_on: string | null;
  client_snapshot: InvoiceClient;
  brand_snapshot: BrandSnapshot;
  subtotal: number;
  total_tax: number;
  total: number;
  notes: string | null;
  reminders: string[];
  followups_paused: boolean;
  created_at: string;
  updated_at: string;
  /** Present only when the query embeds them; see `getInvoices`. */
  invoice_items?: InvoiceItemRow[];
}

export function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    brandId: row.brand_id,
    clientId: row.client_id,
    currency: row.currency,
    status: row.status,
    // `date` columns come back as plain "yyyy-MM-dd" with no timezone, which
    // is exactly the domain shape — deliberately NOT passed through `Date`,
    // which would shift a bill date across midnight for anyone west of UTC.
    billDate: row.bill_date,
    dueDate: row.due_date,
    paidOn: row.paid_on ?? undefined,
    client: row.client_snapshot,
    brandSnapshot: row.brand_snapshot,
    items: (row.invoice_items ?? [])
      // PostgREST does not promise embedded rows come back ordered, and
      // line-item order is meaningful — it is what prints on the invoice.
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(
        (item): LineItem => ({
          id: item.id,
          description: item.description,
          amount: Number(item.amount),
          tax: Number(item.tax),
        })
      ),
    subtotal: Number(row.subtotal),
    totalTax: Number(row.total_tax),
    total: Number(row.total),
    notes: orUndefined(row.notes),
    reminders: row.reminders,
    followupsPaused: row.followups_paused,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Builds the jsonb payload both invoice RPCs take.
 *
 * `id` and `invoice_number` are included only when preserving an existing
 * invoice's identity — a restore. `create_invoice` allocates both when they
 * are absent, which is what the invoice form relies on.
 */
export function invoiceToPayload(
  invoice: Invoice,
  options: { preserveNumber?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: invoice.id,
    brand_id: invoice.brandId,
    client_id: invoice.clientId ?? "",
    status: invoice.status,
    currency: invoice.currency,
    bill_date: invoice.billDate,
    due_date: invoice.dueDate,
    paid_on: invoice.paidOn ?? "",
    client_snapshot: invoice.client,
    brand_snapshot: invoice.brandSnapshot,
    subtotal: invoice.subtotal,
    total_tax: invoice.totalTax,
    total: invoice.total,
    notes: invoice.notes ?? null,
    reminders: invoice.reminders,
    followups_paused: invoice.followupsPaused,
    items: invoice.items.map((item) => ({
      description: item.description,
      amount: item.amount,
      tax: item.tax,
    })),
  };

  if (options.preserveNumber) {
    payload.invoice_number = invoice.invoiceNumber;
    // Parsed here rather than in plpgsql: numbering.ts already understands
    // both the legacy "SC2026001" shape and the current one, and is tested.
    // A number that will not parse is stored verbatim with no sequence,
    // which the schema allows for exactly this case.
    const parsed = parseInvoiceNumber(
      invoice.invoiceNumber,
      invoice.brandSnapshot.invoicePrefix
    );
    payload.number_year = parsed?.year ?? null;
    payload.number_seq = parsed?.seq ?? null;
  }

  return payload;
}

export function rowToTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    tone: row.tone,
    body: row.body,
    createdAt: toIso(row.created_at),
  };
}

export function templateToRow(template: EmailTemplate): EmailTemplateRow {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    tone: template.tone,
    body: template.body,
    created_at: template.createdAt,
  };
}
