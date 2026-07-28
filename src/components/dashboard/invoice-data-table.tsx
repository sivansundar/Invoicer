"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AlignLeft, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Invoice } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  INVOICE_TABS,
  invoiceTabCounts,
  runInvoiceTablePipeline,
  type InvoiceTab,
} from "@/lib/invoice-table";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { StatusBadge } from "@/components/invoices/status-badge";
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
}

export function InvoiceDataTable({ invoices: allInvoices }: InvoiceDataTableProps) {
  // Applied here, not by the caller — same reasoning as stat-cards.tsx /
  // revenue-chart.tsx: this component renders as a descendant of <Shell>'s
  // BrandFilterProvider, while DashboardPage (the caller) does not.
  const { brandId } = useBrandFilter();

  const [tab, setTab] = useState<InvoiceTab>("all");
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
      <div className="flex items-center gap-3 flex-wrap px-6">
        <div className="inline-flex items-center h-9 bg-accent rounded-[10px] p-[3px]">
          {INVOICE_TABS.map((value) => {
            const selected = value === tab;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-pressed={selected}
                className={cn(
                  "h-[30px] px-2.5 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors",
                  selected ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
              >
                {TAB_LABEL[value]}
                <span className="bg-border rounded-full px-1.5 text-[11px] tabular-nums">
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
          className="h-8 w-[180px]"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <AlignLeft className="size-3.5" />
              Columns
              <ChevronDown className="size-3.5" />
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

        <Button variant="outline" size="sm" className="h-8" asChild>
          <Link href="/invoices/create">Add invoice</Link>
        </Button>
      </div>

      {/* Table */}
      <div className="px-6">
        <div className="border rounded-[14px] bg-card overflow-hidden">
          <div className="flex items-center h-10 px-4 bg-muted border-b text-sm font-medium">
            <div className="flex-[0_0_130px]">Invoice</div>
            <div className="flex-[1.5]">Client</div>
            {columns.brand && <div className="flex-1">Brand</div>}
            {columns.due && <div className="flex-1">Due</div>}
            {columns.amount && <div className="flex-1 text-right">Amount</div>}
            {columns.status && <div className="flex-[0_0_100px] text-right">Status</div>}
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium">Nothing here</p>
              <p className="text-sm text-muted-foreground mt-1">
                No invoices match this filter — calm, isn&apos;t it?
              </p>
            </div>
          ) : (
            rows.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="flex items-center px-4 py-3 border-b text-sm cursor-pointer transition-colors hover:bg-muted last:border-b-0"
              >
                <div className="flex-[0_0_130px] font-mono text-[13px] text-muted-foreground truncate pr-2">
                  {invoice.invoiceNumber}
                </div>
                <div className="flex-[1.5] font-medium truncate pr-2">
                  {invoice.client.companyName}
                </div>
                {columns.brand && (
                  <div className="flex-1 flex items-center gap-1.5 text-[13px] text-muted-foreground pr-2">
                    <span
                      className="inline-block size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: invoice.brandSnapshot.accentColor }}
                    />
                    <span className="truncate">{invoice.brandSnapshot.invoicePrefix}</span>
                  </div>
                )}
                {columns.due && (
                  <div className="flex-1 text-muted-foreground pr-2">
                    {invoice.dueDate ? (
                      <>
                        {invoice.status === "paid" ? "Paid " : ""}
                        {format(new Date(`${invoice.dueDate}T00:00`), "MMM d")}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                )}
                {columns.amount && (
                  <div className="flex-1 text-right font-medium tabular-nums pr-2">
                    {formatCurrency(invoice.total, invoice.currency ?? "INR")}
                  </div>
                )}
                {columns.status && (
                  <div className="flex-[0_0_100px] text-right">
                    <StatusBadge status={invoice.status} />
                  </div>
                )}
              </Link>
            ))
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
