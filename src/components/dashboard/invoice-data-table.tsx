"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlignLeft, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import { daysLate, effectiveStatus } from "@/lib/dashboard";
import {
  INVOICE_TABS,
  invoiceTabCounts,
  runInvoiceTablePipeline,
  type InvoiceTab,
} from "@/lib/invoice-table";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { StatusPill, TwoLineCell } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const TAB_LABEL: Record<InvoiceTab, string> = {
  all: "All",
  paid: "Paid",
  sent: "Sent",
  draft: "Draft",
  overdue: "Overdue",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface OptionalColumns {
  brand: boolean;
  due: boolean;
  amount: boolean;
  status: boolean;
}

const DEFAULT_COLUMNS: OptionalColumns = {
  brand: true,
  due: true,
  amount: true,
  status: true,
};

interface InvoiceDataTableProps {
  invoices: Invoice[];
  /**
   * The tab to open on. The caller decides — /invoices reads it from the
   * `?tab=` the dashboard's "Needs you" buttons link with, the dashboard's
   * own copy of this table just takes the default.
   */
  initialTab?: InvoiceTab;
}

export function InvoiceDataTable({
  invoices: allInvoices,
  initialTab = "all",
}: InvoiceDataTableProps) {
  // Applied here, not by the caller — same reasoning as stat-cards.tsx /
  // revenue-chart.tsx: this component renders as a descendant of <Shell>'s
  // BrandFilterProvider, while DashboardPage (the caller) does not.
  const { brandId } = useBrandFilter();

  const [tab, setTab] = useState<InvoiceTab>(initialTab);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState<OptionalColumns>(DEFAULT_COLUMNS);

  // Changing the tab, the search text or the page size resets the page to 1
  // — otherwise a user on page 4 filters down to three results and lands on
  // an empty table. Adjusted during render (the React-docs "storing
  // information from previous renders" pattern) rather than in a useEffect,
  // which would call setState synchronously in an effect body and cause an
  // extra cascading render — the same anti-pattern this codebase's storage
  // hooks were already converted away from (see progress notes on Task 8).
  const [prevFilters, setPrevFilters] = useState({ tab, query, pageSize });
  if (prevFilters.tab !== tab || prevFilters.query !== query || prevFilters.pageSize !== pageSize) {
    setPrevFilters({ tab, query, pageSize });
    setPage(1);
  }

  const counts = useMemo(() => invoiceTabCounts(allInvoices, brandId), [allInvoices, brandId]);

  const result = useMemo(
    () =>
      runInvoiceTablePipeline({
        invoices: allInvoices,
        brandId,
        tab,
        query,
        page,
        pageSize,
      }),
    [allInvoices, brandId, tab, query, page, pageSize]
  );

  const { rows, filteredCount, totalPages } = result;
  // The pipeline clamps out-of-range requests, so the page it actually served
  // (not the raw `page` state) is the source of truth for the footer/buttons.
  const servedPage = result.page;
  const from = filteredCount === 0 ? 0 : (servedPage - 1) * pageSize + 1;
  const to = filteredCount === 0 ? 0 : from + rows.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-8">
        <div className="inline-flex h-9 items-center gap-0.5 rounded-[11px] bg-field p-[3px]">
          {INVOICE_TABS.map((value) => {
            const selected = value === tab;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-colors",
                  selected
                    ? "bg-surface text-ink shadow-[var(--shadow-pill)]"
                    : "text-ink-2 hover:text-ink"
                )}
              >
                {TAB_LABEL[value]}
                <span className="rounded-full bg-line px-1.5 text-[11px] tabular-nums">
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <Input
          placeholder="Search invoices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-[200px] rounded-[10px] bg-surface"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 gap-2 rounded-[10px]">
              <AlignLeft className="size-4 text-ink-2" />
              Columns
              <ChevronDown className="size-4 text-ink-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={columns.brand}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                setColumns((c) => ({ ...c, brand: checked === true }))
              }
            >
              Brand
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={columns.due}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => setColumns((c) => ({ ...c, due: checked === true }))}
            >
              Due
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={columns.amount}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                setColumns((c) => ({ ...c, amount: checked === true }))
              }
            >
              Amount
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={columns.status}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                setColumns((c) => ({ ...c, status: checked === true }))
              }
            >
              Status
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="px-8">
        <div className="overflow-hidden rounded-card border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-4 border-b px-5 py-3 text-[12.5px] font-medium text-ink-3">
            <div className="flex-[2.1]">Client</div>
            <div className="flex-[1.3]">Invoice</div>
            {columns.brand && <div className="flex-1">Brand</div>}
            {columns.due && <div className="flex-[1.2]">Due</div>}
            {columns.amount && <div className="flex-[1.1]">Amount</div>}
            {columns.status && <div className="flex-[0_0_104px]">Status</div>}
            <div className="flex-[0_0_92px]" />
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium">Nothing here</p>
              <p className="mt-1 text-sm text-ink-2">
                No invoices match this filter — calm, isn&apos;t it?
              </p>
            </div>
          ) : (
            rows.map((invoice) => {
              const status = effectiveStatus(invoice);
              const late = daysLate(invoice);
              const dueSub =
                invoice.status === "paid"
                  ? "settled"
                  : status === "overdue"
                    ? `${late} ${late === 1 ? "day" : "days"} late`
                    : invoice.dueDate
                      ? "on terms"
                      : "no due date";

              return (
                <div
                  key={invoice.id}
                  className="flex items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-canvas"
                >
                  {/* One link over the data cells: a per-row action button
                      cannot live inside an anchor, so it is a sibling. */}
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <div className="flex flex-[2.1] min-w-0 items-center gap-3">
                      <span
                        className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold text-white"
                        style={{ backgroundColor: invoice.brandSnapshot.accentColor }}
                      >
                        {invoice.client.companyName.trim().slice(0, 1).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-medium">
                          {invoice.client.companyName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              status === "overdue"
                                ? "bg-red"
                                : status === "paid"
                                  ? "bg-green"
                                  : status === "sent"
                                    ? "bg-blue"
                                    : "bg-ink-3"
                            )}
                          />
                          <span className="truncate text-[12.5px] text-ink-3">
                            {invoice.client.name || invoice.brandSnapshot.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-[1.3]">
                      <TwoLineCell
                        top={invoice.invoiceNumber}
                        sub={invoice.brandSnapshot.name}
                        mono
                      />
                    </div>

                    {columns.brand && (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-ink-3">
                        <span
                          className="inline-block size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: invoice.brandSnapshot.accentColor }}
                        />
                        <span className="truncate">{invoice.brandSnapshot.invoicePrefix}</span>
                      </div>
                    )}

                    {columns.due && (
                      <div className="min-w-0 flex-[1.2]">
                        <TwoLineCell
                          top={formatStoredDate(invoice.dueDate, "d MMM")}
                          sub={dueSub}
                          subClassName={status === "overdue" ? "text-red" : undefined}
                        />
                      </div>
                    )}

                    {columns.amount && (
                      <div className="min-w-0 flex-[1.1]">
                        <TwoLineCell
                          top={formatCurrency(invoice.total, invoice.currency ?? "INR")}
                          sub={invoice.currency ?? "INR"}
                        />
                      </div>
                    )}

                    {columns.status && (
                      <div className="flex-[0_0_104px]">
                        {/* effectiveStatus, not the raw stored status — a row
                            that just got filtered into the Overdue tab must not
                            turn around and badge itself "Sent". */}
                        <StatusPill status={status} />
                      </div>
                    )}
                  </Link>

                  <div className="flex flex-[0_0_92px] justify-end">
                    {status === "overdue" ? (
                      <Button
                        asChild
                        className="h-8 rounded-[9px] bg-ink px-3 text-canvas hover:bg-ink/90"
                      >
                        <Link href={`/invoices/${invoice.id}`}>Chase</Link>
                      </Button>
                    ) : invoice.status === "draft" ? (
                      <Button asChild variant="outline" className="h-8 rounded-[9px] px-3">
                        <Link href={`/invoices/${invoice.id}/edit`}>Finish</Link>
                      </Button>
                    ) : (
                      <Button asChild variant="outline" className="h-8 rounded-[9px] px-3">
                        <Link href={`/invoices/${invoice.id}`}>Open</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center gap-4 px-6 flex-wrap">
        <div className="flex-1 text-sm text-muted-foreground">
          {filteredCount === 0 ? (
            "No invoices"
          ) : (
            <span className="tabular-nums">
              Showing {from}–{to} of {filteredCount} invoices
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <NativeSelect
            size="sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-[70px]"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <span className="text-sm text-muted-foreground tabular-nums">
          Page {servedPage} of {totalPages}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={servedPage <= 1}
            onClick={() => setPage(servedPage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={servedPage >= totalPages}
            onClick={() => setPage(servedPage + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
