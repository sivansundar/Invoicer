import type { Brand, Client, Invoice, InvoiceStatus } from "./types";

const VALID_STATUSES: ReadonlySet<string> = new Set<InvoiceStatus>([
  "draft",
  "sent",
  "paid",
  "overdue",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Whether a parsed JSON value is a line item shape that every rendering
 * path (invoice preview totals, `invoice-pdf.tsx`'s `item.amount * item.tax`,
 * the detail page's `item.description`) dereferences without a guard.
 * `id` is only used as a React key, so its absence degrades rendering
 * rather than throwing — intentionally not required here.
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
 * invoice reads without a guard. This is deliberately not a full schema
 * validator — `currency` is left out on purpose: existing call sites
 * already fall back with `invoice.currency ?? "INR"`, so a record missing
 * it renders fine rather than needing to be rejected here.
 */
function isValidInvoiceRecord(value: unknown): value is Invoice {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.invoiceNumber)) return false;
  if (!isNonEmptyString(value.brandId)) return false;
  if (typeof value.status !== "string" || !VALID_STATUSES.has(value.status))
    return false;
  if (typeof value.billDate !== "string") return false;
  if (typeof value.dueDate !== "string") return false;
  if (!isRecord(value.client) || typeof value.client.companyName !== "string")
    return false;
  if (!Array.isArray(value.items) || !value.items.every(isValidLineItem))
    return false;
  if (typeof value.subtotal !== "number") return false;
  if (typeof value.totalTax !== "number") return false;
  if (typeof value.total !== "number") return false;
  if (typeof value.createdAt !== "string") return false;
  if (typeof value.updatedAt !== "string") return false;
  return true;
}

/**
 * `BankDetails` is embedded (not top-level) on `Brand`, but
 * `brand-card.tsx` reads `brand.bankDetails.bankName` with no guard on
 * `bankDetails` itself — a brand record missing it entirely would throw on
 * render, not just display blank. `branch`/`upiId` are optional on the type
 * and already rendered conditionally, so they are deliberately not
 * required here.
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
 * reads without a guard (`brand-card.tsx`'s `name`, `invoicePrefix`,
 * `email`, `bankDetails.*`). `nextInvoiceNumber` is not required —
 * `getNextInvoiceNumber` derives the next number from existing invoices,
 * not from this field.
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
 * Whether a parsed JSON value has every field a screen that renders a
 * client reads without a guard (`client-card.tsx`'s `companyName`).
 * `name`, `email`, `phone`, `gstNumber` are optional on the type and
 * already tolerate being absent.
 */
function isValidClientRecord(value: unknown): value is Client {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.companyName)) return false;
  if (typeof value.address !== "string") return false;
  if (typeof value.createdAt !== "string") return false;
  return true;
}

export type ImportValidationResult =
  | { ok: false }
  | { ok: true; valid: Invoice[]; skipped: number };

/**
 * Validates an uploaded invoices export before anything is written.
 * `ok: false` means the whole file is unusable (not even an array);
 * otherwise every element that isn't an object, or is missing a field a
 * rendering screen depends on, is counted in `skipped` rather than
 * silently dropped without a trace.
 *
 * This is also the legacy import path: every `invoices-<date>.json` file a
 * user already has on disk is a bare `Invoice[]` array, exactly this
 * shape. `import-export.tsx` detects that shape (`Array.isArray`) before a
 * full backup envelope is even considered, so those files keep importing
 * through this exact function, unchanged, forever.
 */
export function validateImportedInvoices(
  parsed: unknown
): ImportValidationResult {
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
  // A field simply absent from the envelope (e.g. this codebase never
  // writes `templates`, or an older/partial export never had any
  // brands/clients to include) is not an error — it's treated the same as
  // an empty array. This is also what keeps a `version: 2` backup produced
  // by the richer sibling rewrite branch (which does write `templates`)
  // importing cleanly here: the extra key is simply ignored.
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
      invoices: CollectionValidation<Invoice>;
    };

/**
 * Validates an uploaded full-backup envelope
 * (`{ version, exportedAt, brands, clients, invoices }`) before anything is
 * written. `ok: false` means the payload isn't even a JSON object (a
 * string, a number, `null` — or an array, which `import-export.tsx` routes
 * to `validateImportedInvoices` instead, never here). Beyond that, every
 * collection is validated independently: a mangled `clients` section does
 * not block `brands`/`invoices` from importing, and every skip is counted,
 * never silently dropped.
 */
export function validateImportedBackup(parsed: unknown): BackupValidationResult {
  if (!isRecord(parsed)) return { ok: false };

  return {
    ok: true,
    brands: validateCollection(parsed.brands, isValidBrandRecord),
    clients: validateCollection(parsed.clients, isValidClientRecord),
    invoices: validateCollection(parsed.invoices, isValidInvoiceRecord),
  };
}
