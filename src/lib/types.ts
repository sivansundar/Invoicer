export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  branch?: string;
  upiId?: string;
}

/**
 * US receiving details for a brand that wants to be paid by ACH — added
 * alongside `BankDetails` (never replacing it) for an Indian freelancer
 * billing a US client through a USD-holding account (e.g. Wise, Payoneer)
 * instead of their Indian bank. `routingNumber` is the US equivalent of
 * `ifscCode`: it identifies the receiving bank/branch for the transfer, not
 * the payer's own bank.
 */
export interface AchDetails {
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  accountType?: "checking" | "savings";
}

/**
 * Which payment rail an invoice's "Payment details" block renders. Every
 * `Brand` has always had `bankDetails` (IFSC), so `"ifsc"` is the implicit
 * default everywhere this is optional — a `Client.defaultPaymentMethod`,
 * `Invoice.paymentMethod`, or a pre-this-feature invoice with neither field
 * at all. That's deliberate: it means an invoice created before ACH existed
 * renders exactly as it always did, with no migration or backfill required.
 */
export type PaymentMethod = "ifsc" | "ach";

/** `undefined` reads as `"ifsc"` everywhere a `PaymentMethod` is optional — see `PaymentMethod`. */
export function resolvePaymentMethod(method: PaymentMethod | undefined): PaymentMethod {
  return method ?? "ifsc";
}

/**
 * Which of the two predefined invoice layouts a brand's invoices render as.
 * Unrelated to `EmailTemplate` / `useTemplates()` (the follow-up email
 * copy) — this governs the invoice document itself, on screen and in the
 * PDF, so it's named `InvoiceDesign` rather than overloading "template".
 */
export type InvoiceDesign = "modern" | "classic";

export interface Brand {
  id: string;
  name: string;
  address: string;
  email: string;
  phone?: string;
  gstNumber?: string;
  panNumber?: string;
  logo?: string; // base64 data URL
  bankDetails: BankDetails;
  /**
   * US ACH receiving details, offered alongside `bankDetails` rather than
   * instead of it — a brand with no reason to bill in USD simply never sets
   * this, and every invoice keeps rendering its IFSC details exactly as
   * before. Optional with no backfill: unlike `accentColor`/`followup`/
   * `invoiceDesign` above, nothing ever depended on every brand having one.
   */
  achDetails?: AchDetails;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  createdAt: string;
  accentColor: string;
  followup: FollowupConfig;
  /**
   * Required here the same way `accentColor`/`followup` are: every `Brand`
   * actually in memory has one. A brand written before this field existed
   * has it backfilled by `migrateToV2` (`@/lib/migrate`) before anything
   * else ever reads it — the same boundary that backfills `accentColor` and
   * `followup`. Raw, not-yet-migrated JSON is a different story: there the
   * type is a promise, not a fact, which is exactly why `migrateToV2` itself
   * still reads this field through `resolveInvoiceDesign`
   * (`@/lib/invoice-design`) rather than trusting it.
   */
  invoiceDesign: InvoiceDesign;
}

export interface Client {
  id: string;
  name?: string;
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  createdAt: string;
  /**
   * Which payment rail the invoice form pre-selects when this client is
   * picked as "Billed to" — a nudge for the invoice form, not a promise:
   * `resolvePaymentMethod` reads a missing value as `"ifsc"`, and the
   * invoice form falls back to `"ifsc"` regardless of this field when the
   * chosen brand has no `achDetails` to actually render.
   */
  defaultPaymentMethod?: PaymentMethod;
}

export interface InvoiceClient {
  name?: string;
  companyName: string;
  address: string;
  email?: string;
  gstNumber?: string;
}

export interface LineItem {
  id: string;
  description: string;
  amount: number;
  tax: number; // percentage
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type Currency = "INR" | "USD" | "SGD";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  brandId: string;
  currency: Currency;
  status: InvoiceStatus;
  billDate: string;
  dueDate: string;
  client: InvoiceClient;
  items: LineItem[];
  subtotal: number;
  totalTax: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  brandSnapshot: BrandSnapshot;
  /** Back-reference to a saved client. Null when no client record matches. */
  clientId: string | null;
  /** ISO "yyyy-MM-dd" dates on which a reminder was recorded. MOCK: nothing is sent. */
  reminders: string[];
  followupsPaused: boolean;
  /**
   * "yyyy-MM-dd" date payment actually arrived, as distinct from `billDate`.
   * Set to today when the invoice is marked paid; editable afterwards from
   * the invoice detail screen because you mark an invoice paid when you
   * *notice*, not when the money landed. Undefined for invoices paid before
   * this field existed — never backfilled, since the real date is unknown —
   * and cleared whenever `status` moves off `"paid"`.
   */
  paidOn?: string;
  /**
   * Which payment rail this invoice's "Payment details" block renders,
   * chosen on the invoice form (pre-filled from `Client.defaultPaymentMethod`
   * when a saved client is picked, overridable per invoice) and frozen at
   * save time — editing the brand or the client afterwards must not change
   * which rail an already-issued invoice shows, the same guarantee
   * `brandSnapshot` gives the bank/ACH details themselves. Undefined (every
   * invoice issued before this feature existed) reads as `"ifsc"` via
   * `resolvePaymentMethod`.
   */
  paymentMethod?: PaymentMethod;
}

export type EmailTone = "Friendly" | "Direct" | "Firm";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  tone: EmailTone;
  body: string;
  createdAt: string;
}

export interface FollowupConfig {
  enabled: boolean;
  mode: "weekly" | "custom";
  /** 0 = Sunday … 6 = Saturday. Only meaningful when mode is "custom". */
  weekday: number;
  /** "HH:mm", 24-hour. */
  time: string;
  repeat: "week" | "month";
  templateId: string;
  /** 0 means "never stop". */
  stopAfter: number;
}

/**
 * Brand details frozen at invoice-creation time. Editing a brand must never
 * change an invoice that was already issued.
 */
export interface BrandSnapshot {
  name: string;
  address: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  panNumber?: string;
  logo?: string;
  invoicePrefix: string;
  accentColor: string;
  bankDetails: BankDetails;
  /** Frozen the same way `bankDetails` is — see `Brand.achDetails`. */
  achDetails?: AchDetails;
  /**
   * The design this invoice was rendered with at creation time, frozen the
   * same way every other brand detail is — changing a brand's design later
   * must never change how an already-issued invoice looks. Required here for
   * the same reason as `Brand.invoiceDesign` above: every snapshot actually
   * in memory has one, backfilled by `migrateToV2` (`@/lib/migrate`) for any
   * snapshot written before this field existed. A snapshot read straight off
   * unvalidated stored/imported JSON is not covered by that guarantee —
   * `migrateToV2` reads it through `resolveInvoiceDesign`
   * (`@/lib/invoice-design`), never a bare `?? "modern"`.
   */
  invoiceDesign: InvoiceDesign;
}

/** MOCK: no payment integration exists. Persisted locally only. */
export interface PlanState {
  tier: "free" | "pro";
  renewsOn: string | null;
}
