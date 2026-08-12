import type {
  BankDetails,
  Brand,
  Client,
  EmailTemplate,
  EmailTone,
  FollowupConfig,
  InvoiceDesign,
} from "@/lib/types";

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
