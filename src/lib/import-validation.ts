import type { Brand, Client, EmailTemplate, EmailTone, Invoice, InvoiceStatus } from "./types";

const VALID_STATUSES: ReadonlySet<string> = new Set<InvoiceStatus>([
  "draft",
  "sent",
  "paid",
  "overdue",
]);

const VALID_TONES: ReadonlySet<string> = new Set<EmailTone>(["Friendly", "Direct", "Firm"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Whether a parsed JSON value is a line item shape that every rendering
 * path (`invoice-preview.ts`'s `computeTotals`/`taxLabel`, the invoice
 * detail page's `key={item.id}`/`item.description`, `invoice-pdf.tsx`'s
 * `item.amount * item.tax`) dereferences without a guard. `description`,
 * `amount`, and `tax` are exactly the fields those call sites read; `id` is
 * used only as a React key, where a missing value degrades rendering rather
 * than throwing, so it is intentionally not required here.
 */
function isValidLineItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.description !== "string") return false;
  if (typeof value.amount !== "number") return false;
  if (typeof value.tax !== "number") return false;
  return true;
}

/**
 * Whether a parsed JSON value has every field a screen that renders an
 * invoice actually reads. This is deliberately not a full schema validator
 * — extra/unknown fields pass through untouched, and fields the app already
 * tolerates being absent (`brandSnapshot`, `clientId`, `reminders`,
 * `followupsPaused`, `currency`) are left to `forceMigration` and the `??`
 * fallbacks already scattered through `reports.ts`/`invoice-table.ts`, not
 * re-validated here. The goal is narrower: a hand-edited or corrupt record
 * cannot reach `formatStoredDate`, a currency formatter, or a property
 * access on `client.companyName` with a shape those call sites don't expect.
 */
function isValidInvoiceRecord(value: unknown): value is Invoice {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.invoiceNumber)) return false;
  if (!isNonEmptyString(value.brandId)) return false;
  if (typeof value.status !== "string" || !VALID_STATUSES.has(value.status)) return false;
  if (typeof value.billDate !== "string") return false;
  if (typeof value.dueDate !== "string") return false;
  if (!isRecord(value.client) || typeof value.client.companyName !== "string") return false;
  if (!Array.isArray(value.items) || !value.items.every(isValidLineItem)) return false;
  if (typeof value.subtotal !== "number") return false;
  if (typeof value.totalTax !== "number") return false;
  if (typeof value.total !== "number") return false;
  if (typeof value.createdAt !== "string") return false;
  if (typeof value.updatedAt !== "string") return false;
  return true;
}

/**
 * `BankDetails` is embedded (not top-level) on `Brand`, but
 * `app/brands/page.tsx`'s card reads `brand.bankDetails.bankName` with no
 * guard on `bankDetails` itself — a brand record with `bankDetails` missing
 * entirely would throw on render, not just display blank. `branch`/`upiId`
 * are optional on the type and are already rendered conditionally, so they
 * are deliberately not required here.
 */
function isValidBankDetails(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.accountName !== "string") return false;
  if (typeof value.accountNumber !== "string") return false;
  if (typeof value.bankName !== "string") return false;
  if (typeof value.ifscCode !== "string") return false;
  return true;
}

/**
 * Whether a parsed JSON value has every field a screen that renders a brand
 * reads without a guard (`app/brands/page.tsx`'s card: `name`,
 * `invoicePrefix`, `address`, `bankDetails.*`; `brand-form.tsx`'s edit
 * title). `accentColor` and `followup` are deliberately NOT required here —
 * they're the same class of field `isValidInvoiceRecord` above already
 * excludes: `migrateToV2` backfills both with `??` (`accentColor ??
 * paletteColorForIndex(index)`, `followup ?? defaultFollowupConfig()`), and
 * `forceMigration()` runs immediately after every import, so a record
 * missing them is patched before anything renders it. `nextInvoiceNumber` is
 * documented dead state (nothing reads it) and is not required either.
 */
function isValidBrandRecord(value: unknown): value is Brand {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.name)) return false;
  if (typeof value.address !== "string") return false;
  if (typeof value.email !== "string") return false;
  if (typeof value.invoicePrefix !== "string") return false;
  if (typeof value.createdAt !== "string") return false;
  if (!isValidBankDetails(value.bankDetails)) return false;
  return true;
}

/**
 * Whether a parsed JSON value has every field a screen that renders a client
 * reads without a guard (`app/clients/page.tsx`'s row: `companyName`;
 * `client-form.tsx`'s edit title and delete toast). `name`, `email`,
 * `gstNumber` are optional on the type and already tolerate being absent
 * (`client.name || "—"`).
 */
function isValidClientRecord(value: unknown): value is Client {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.companyName)) return false;
  if (typeof value.address !== "string") return false;
  if (typeof value.createdAt !== "string") return false;
  return true;
}

/**
 * Whether a parsed JSON value has every field a screen that renders an email
 * template reads (`template-list.tsx`'s `name`/`subject`/`tone`,
 * `brand-followup-card.tsx`'s lookup by `id`). `tone` is checked against the
 * same `EmailTone` union the type declares, the same way `status` is checked
 * for invoices — an out-of-union string would otherwise reach the tone badge
 * with no matching style.
 */
function isValidTemplateRecord(value: unknown): value is EmailTemplate {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (typeof value.name !== "string") return false;
  if (typeof value.subject !== "string") return false;
  if (typeof value.body !== "string") return false;
  if (typeof value.tone !== "string" || !VALID_TONES.has(value.tone)) return false;
  if (typeof value.createdAt !== "string") return false;
  return true;
}

export type ImportValidationResult =
  | { ok: false }
  | { ok: true; valid: Invoice[]; skipped: number };

/**
 * Validates an uploaded invoices export before anything is written —
 * `import-export.tsx` is the one place in this app that parses untrusted
 * JSON, and a hand-edited or corrupt file previously reached storage (and
 * every downstream screen) with zero checks. `ok: false` means the whole
 * file is unusable (not even an array); otherwise every element that isn't
 * an object, or is missing a field a rendering screen depends on, is
 * counted in `skipped` rather than silently dropped without a trace.
 *
 * This is also the legacy import path: every `invoices-<date>.json` file a
 * user already has on disk is a bare `Invoice[]` array, exactly this shape.
 * `import-export.tsx` detects that shape (`Array.isArray`) before a full
 * backup envelope is even considered, so those files keep importing through
 * this exact function, unchanged, forever.
 */
export function validateImportedInvoices(parsed: unknown): ImportValidationResult {
  if (!Array.isArray(parsed)) return { ok: false };

  const valid: Invoice[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (isValidInvoiceRecord(item)) {
      valid.push(item);
    } else {
      skipped++;
    }
  }
  return { ok: true, valid, skipped };
}

export interface CollectionValidation<T> {
  valid: T[];
  skipped: number;
  /**
   * True when the collection's value in the file wasn't an array at all
   * (e.g. a string or an object where a list was expected). The whole
   * collection is treated as empty rather than guessed at — but this does
   * NOT reject the rest of the file, so a backup with one mangled section
   * still restores everything else.
   */
  invalidShape: boolean;
}

function validateCollection<T>(
  raw: unknown,
  isValid: (value: unknown) => value is T
): CollectionValidation<T> {
  // A field simply absent from the envelope (an older/partial export, or one
  // that never had any brands/clients/templates to include) is not an error
  // — it's treated the same as an empty array.
  if (raw === undefined) return { valid: [], skipped: 0, invalidShape: false };
  if (!Array.isArray(raw)) return { valid: [], skipped: 0, invalidShape: true };

  const valid: T[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (isValid(item)) valid.push(item);
    else skipped++;
  }
  return { valid, skipped, invalidShape: false };
}

export type BackupValidationResult =
  | { ok: false }
  | {
      ok: true;
      brands: CollectionValidation<Brand>;
      clients: CollectionValidation<Client>;
      templates: CollectionValidation<EmailTemplate>;
      invoices: CollectionValidation<Invoice>;
    };

/**
 * Validates an uploaded full-backup envelope
 * (`{ version, exportedAt, brands, clients, templates, invoices }`) before
 * anything is written. `ok: false` means the payload isn't even a JSON
 * object (a string, a number, `null` — or an array, which `import-export.tsx`
 * routes to `validateImportedInvoices` instead, never here). Beyond that,
 * every one of the four collections is validated independently: a mangled
 * `clients` section does not block `brands`/`templates`/`invoices` from
 * importing, and every skip is counted, never silently dropped.
 */
export function validateImportedBackup(parsed: unknown): BackupValidationResult {
  if (!isRecord(parsed)) return { ok: false };

  return {
    ok: true,
    brands: validateCollection(parsed.brands, isValidBrandRecord),
    clients: validateCollection(parsed.clients, isValidClientRecord),
    templates: validateCollection(parsed.templates, isValidTemplateRecord),
    invoices: validateCollection(parsed.invoices, isValidInvoiceRecord),
  };
}
