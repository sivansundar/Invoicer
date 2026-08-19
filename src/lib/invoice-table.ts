import { effectiveStatus } from "./dashboard";
import type { Invoice, InvoiceStatus } from "./types";

export type InvoiceTab = "all" | InvoiceStatus;

export const INVOICE_TABS: InvoiceTab[] = ["all", "paid", "sent", "draft", "overdue"];

/**
 * The tab a `?tab=` search param asks for, or `"all"` when it asks for
 * nothing this table has.
 *
 * The dashboard's "Needs you" cards link at `/invoices?tab=overdue` and
 * friends. Until this existed the table held its tab in state and never read
 * the URL, so all three buttons landed on the same default tab and the param
 * was decoration. An unrecognised value falls back rather than throwing: a
 * hand-edited or stale URL should show the invoice list, not an error.
 */
export function parseInvoiceTab(value: string | null | undefined): InvoiceTab {
  return INVOICE_TABS.find((tab) => tab === value) ?? "all";
}

export interface InvoiceTablePipelineParams {
  invoices: Invoice[];
  /** Same shape as StatCards/RevenueChart: null means "all brands". */
  brandId: string | null;
  tab: InvoiceTab;
  query: string;
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Defaults to `new Date()`. Threaded through for deterministic tests —
   *  the tab filter is scoped against `effectiveStatus`, not the raw stored
   *  status, so "today" affects which invoices count as overdue. */
  today?: Date;
}

export interface InvoiceTablePipelineResult {
  /** Rows for the requested page, after brand/tab/search filtering. */
  rows: Invoice[];
  /** Count of rows matching brand + tab + search, before pagination. */
  filteredCount: number;
  /** The page actually served — clamped into [1, totalPages] so an out-of-range
   *  request (e.g. the underlying data shrank) never renders a blank page. */
  page: number;
  /** Always >= 1, even when filteredCount is 0. */
  totalPages: number;
}

function matchesQuery(invoice: Invoice, needle: string): boolean {
  if (!needle) return true;
  return (
    invoice.invoiceNumber.toLowerCase().includes(needle) ||
    invoice.client.companyName.toLowerCase().includes(needle)
  );
}

/**
 * Scopes invoices to a brand (identical logic to StatCards/RevenueChart, so
 * the three dashboard surfaces can never disagree about what's in scope),
 * then a status tab, then a case-insensitive search across invoice number
 * and client company name, then slices out one page.
 *
 * Pure function of its params — the component only wires state into this
 * and renders the result. Deliberately does NOT decide "reset to page 1 on
 * filter change"; that is a UI-state policy the caller applies (see
 * invoice-data-table.tsx). This function's only job when handed a page that
 * no longer exists is to clamp it into range rather than return nothing.
 */
export function runInvoiceTablePipeline(
  params: InvoiceTablePipelineParams
): InvoiceTablePipelineResult {
  const { invoices, brandId, tab, query, page, pageSize, today = new Date() } = params;

  const brandScoped = brandId
    ? invoices.filter((invoice) => invoice.brandId === brandId)
    : invoices;

  // effectiveStatus, not the raw stored status — "overdue" is never actually
  // written (see dashboard.ts's doc), so a raw-status tab filter would leave
  // the Overdue tab permanently empty and never move a late invoice out of
  // the Sent tab.
  const tabScoped =
    tab === "all"
      ? brandScoped
      : brandScoped.filter((invoice) => effectiveStatus(invoice, today) === tab);

  const needle = query.trim().toLowerCase();
  const filtered = tabScoped
    .filter((invoice) => matchesQuery(invoice, needle))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (clampedPage - 1) * pageSize;

  return {
    rows: filtered.slice(start, start + pageSize),
    filteredCount: filtered.length,
    page: clampedPage,
    totalPages,
  };
}

export type InvoiceTabCounts = Record<InvoiceTab, number>;

/**
 * Counts per tab, scoped to the active brand only — deliberately independent
 * of the search query and the selected tab, so the pills always describe the
 * whole (brand-scoped) dataset rather than chasing whatever the user typed.
 */
export function invoiceTabCounts(
  invoices: Invoice[],
  brandId: string | null,
  today: Date = new Date()
): InvoiceTabCounts {
  const scoped = brandId ? invoices.filter((invoice) => invoice.brandId === brandId) : invoices;
  // paid/draft are read straight off the stored status (never reclassified);
  // sent/overdue go through effectiveStatus so a late invoice counts once,
  // under Overdue, not under Sent — see dashboard.ts's doc.
  return {
    all: scoped.length,
    paid: scoped.filter((invoice) => invoice.status === "paid").length,
    sent: scoped.filter((invoice) => effectiveStatus(invoice, today) === "sent").length,
    draft: scoped.filter((invoice) => invoice.status === "draft").length,
    overdue: scoped.filter((invoice) => effectiveStatus(invoice, today) === "overdue").length,
  };
}
