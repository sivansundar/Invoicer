import type { Invoice, InvoiceStatus } from "./types";

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
