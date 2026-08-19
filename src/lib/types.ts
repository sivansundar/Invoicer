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

/**
 * TODO(reminder-sequence): the mockups show a named 3-step sequence — Due
 * soon → Gentle nudge → Final notice — where the wording escalates with the
 * ordinal. This model has one cadence and one template per brand, so every
 * reminder in a chain sends identical copy and only its position varies
 * (which is why `recoveryByOrdinal` in `lib/followup-history.ts` is
 * well-defined and a per-step recovery comparison is not). Needs a schema
 * change: an ordered list of steps, each with its own offset and template,
 * replacing `templateId` plus a single cadence.
 */
export interface FollowupConfig {
  enabled: boolean;
  /**
   * The three-stage sequence. Optional because every brand written before
   * this feature has the old single-cadence shape instead, and `jsonb` was
   * deliberately not migrated for accounts that may never enable reminders —
   * `reminderSchedule` (`@/lib/reminder-stages`) normalises on read, and the
   * new shape is written back only when somebody edits it.
   */
  stages?: {
    stage: "nudge" | "followup" | "final";
    enabled: boolean;
    offsetDays: number;
    templateId: string;
  }[];
  /** Days between repeats of the final notice. 0 = it does not repeat. */
  repeatFinalEveryDays?: number;

  /**
   * DEPRECATED — the pre-stage cadence. Still required because
   * `defaultFollowupConfig` writes all of it and every stored brand has it,
   * so making these optional would be a lie about the data rather than a
   * simplification of it.
   *
   * Nothing schedules from them any more: a stage fires once at an offset
   * rather than repeating weekly, so `mode`, `weekday`, `time`, `repeat` and
   * `stopAfter` have nothing left to express. `templateId` is read once, by
   * `reminderSchedule`, to carry a legacy brand's existing copy onto its
   * first stage.
   *
   * TODO(drop-legacy-cadence): remove these once no stored brand predates
   * the stage model — a migration that rewrites `followup` jsonb, deliberately
   * deferred so this feature did not also become a data migration.
   */
  mode: "weekly" | "custom";
  weekday: number;
  time: string;
  repeat: "week" | "month";
  templateId: string;
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
