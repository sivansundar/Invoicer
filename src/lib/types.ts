export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  branch?: string;
  upiId?: string;
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
  logo?: string; // base64 data URL — a fresh upload, or a pre-Storage brand
  /**
   * Storage object path, `{brand_id}/{sha256}.png`. Set once the logo is in
   * the bucket. `logo` above stays for two reasons: the form must preview a
   * file before it is uploaded, and brands written before Storage existed
   * still carry base64 in `logo_data`.
   */
  logoPath?: string;
  bankDetails: BankDetails;
  invoicePrefix: string;
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
  /**
   * Set on snapshots frozen after logos moved to Storage. Snapshots frozen
   * before that carry base64 in `logo` and keep rendering from it — and will
   * keep arriving indefinitely, because the §11 importer brings in
   * pre-Postgres invoices. Both shapes are permanent; see spec §8.2.
   */
  logoPath?: string;
  invoicePrefix: string;
  accentColor: string;
  bankDetails: BankDetails;
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
