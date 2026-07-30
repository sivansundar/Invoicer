import { Currency } from "./types";

/**
 * The fields "Create invoice" refuses to proceed without, in the same
 * top-to-bottom, left-to-right order they appear in the form. Kept as one
 * ordered tuple — rather than checked in whatever order was convenient to
 * write — so a caller can scroll to `fields[0]` and land on the first
 * *visible* problem, not just the first one this function happened to test.
 */
export const INVOICE_FIELD_ORDER = [
  "brand",
  "client",
  "companyName",
  "contactName",
  "address",
  "billDate",
  "dueDate",
  "currency",
  "lineItems",
] as const;

export type InvoiceField = (typeof INVOICE_FIELD_ORDER)[number];

export interface InvoiceValidationClient {
  companyName: string;
  /** Contact person. Optional on a saved `Client` record, but mandatory here. */
  name?: string;
  address: string;
}

export interface InvoiceValidationInput {
  brandId: string;
  /** Whether "Billed to" has a saved client or manual entry chosen — as
   * distinct from whether that choice's fields are filled in, which is what
   * `client` below is for. */
  clientSelected: boolean;
  client: InvoiceValidationClient;
  billDate: string;
  dueDate: string;
  currency: Currency | "";
  items: { description: string; amount: number }[];
}

export interface InvoiceValidationResult {
  ok: boolean;
  /** Missing fields, in form order. Empty when `ok`. */
  fields: InvoiceField[];
}

/**
 * Mandatory-field gate for the *primary* save action on an invoice — the
 * "Create invoice" button on a new invoice, and the "Save changes" button
 * on an existing one. Deliberately the same rule set for both: an invoice
 * that would be rejected as incomplete on creation is no less incomplete
 * because it happens to already have an id. An older invoice missing, say,
 * a contact name isn't blocked forever by this — the field is highlighted
 * and filled in right there, the same inline-completion path a newly
 * selected saved client with a gap already uses.
 *
 * Never applied to "Save as draft" on either screen — a draft is explicitly
 * a work in progress. `invoice-form.tsx` gates on `asDraft` alone; no
 * `isEdit` branch belongs anywhere in that decision.
 *
 * `currency` is checked here for completeness even though the form's
 * Select always carries a default ("INR") and can never actually reach
 * this function empty — see the currency Select in `invoice-form.tsx`.
 * Nothing in the UI raises this branch; it exists so the contract this
 * function documents ("currency is mandatory") is still true of the
 * function itself, not just of the form around it.
 */
export function validateInvoiceForSave(input: InvoiceValidationInput): InvoiceValidationResult {
  const missing = new Set<InvoiceField>();

  if (!input.brandId) missing.add("brand");
  if (!input.clientSelected) missing.add("client");

  // Company name, contact name and address only have somewhere to be typed
  // once a client (saved or manual) has actually been chosen — flagging them
  // while "Billed to" itself is still empty would point at fields the form
  // isn't even showing yet.
  if (input.clientSelected) {
    if (!input.client.companyName.trim()) missing.add("companyName");
    if (!input.client.name?.trim()) missing.add("contactName");
    if (!input.client.address.trim()) missing.add("address");
  }

  if (!input.billDate) missing.add("billDate");
  if (!input.dueDate) missing.add("dueDate");
  if (!input.currency) missing.add("currency");

  // Stronger than "at least one row": an empty row (added by "Add line
  // item" and then left untouched) does not count. Matches the check this
  // replaces in `invoice-form.tsx`.
  const hasValidLine = input.items.some(
    (item) => item.description.trim() !== "" && item.amount > 0
  );
  if (!hasValidLine) missing.add("lineItems");

  const fields = INVOICE_FIELD_ORDER.filter((field) => missing.has(field));
  return { ok: fields.length === 0, fields };
}

const FIELD_MESSAGE: Record<InvoiceField, string> = {
  brand: "Select a brand first",
  client: "Who's this invoice for? Choose a client or enter one manually",
  companyName: "Who are we billing? Add a company name",
  contactName: "This client needs a contact name to continue",
  address: "This client needs a billing address to continue",
  billDate: "Add a bill date first",
  dueDate: "Add a due date first",
  currency: "Pick a currency first",
  lineItems: "Add at least one line item first",
};

/**
 * Toast copy for a failed `validateInvoiceForSave`. Leads with the first
 * problem in form order — the same one the caller scrolls to — rather than
 * an itemised list, and only hints at the rest so the message stays a single
 * calm sentence instead of growing into a checklist.
 */
export function describeInvoiceValidationError(fields: InvoiceField[]): string {
  const [first, ...rest] = fields;
  const base = FIELD_MESSAGE[first];
  return rest.length > 0 ? `${base} — a few other required fields need it too` : base;
}
