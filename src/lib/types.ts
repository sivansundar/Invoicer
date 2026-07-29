export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  branch?: string;
  upiId?: string;
}

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
  invoicePrefix: string;
  nextInvoiceNumber: number;
  createdAt: string;
  accentColor: string;
  followup: FollowupConfig;
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
  invoicePrefix: string;
  accentColor: string;
  bankDetails: BankDetails;
}

/** MOCK: no payment integration exists. Persisted locally only. */
export interface PlanState {
  tier: "free" | "pro";
  renewsOn: string | null;
}
