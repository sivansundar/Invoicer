"use client";

import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrands } from "@/hooks/use-brands";
import { formatCurrency } from "@/lib/utils";
import { Currency } from "@/lib/types";
import { ImportExport } from "@/components/invoices/import-export";
import { FileText, Plus } from "lucide-react";

export default function DashboardPage() {
  const { invoices, loading: invLoading, refresh } = useInvoices();
  const { brands, loading: brandLoading } = useBrands();

  const loading = invLoading || brandLoading;

  const groupByCurrency = (filtered: typeof invoices) => {
    const groups: Partial<Record<Currency, number>> = {};
    for (const inv of filtered) {
      const cur = inv.currency ?? "INR";
      groups[cur] = (groups[cur] ?? 0) + inv.total;
    }
    return groups;
  };

  const revenueByCurrency = groupByCurrency(invoices.filter((i) => i.status === "paid"));
  const pendingByCurrency = groupByCurrency(invoices.filter((i) => i.status === "sent" || i.status === "overdue"));

  const formatMultiCurrency = (groups: Partial<Record<Currency, number>>) => {
    const entries = Object.entries(groups) as [Currency, number][];
    if (entries.length === 0) return formatCurrency(0, "INR");
    return entries.map(([cur, amt]) => formatCurrency(amt, cur)).join(" / ");
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Overview of your invoicing activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExport onImportDone={refresh} />
          <Link href="/invoices/create">
            <Button size="sm" className="text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Total Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {invoices.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Revenue (Paid)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {formatMultiCurrency(revenueByCurrency)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {formatMultiCurrency(pendingByCurrency)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Invoice History */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Invoice History</h2>
            </div>
            <InvoiceTable invoices={invoices} brands={brands} />
          </div>
        </>
      )}
    </Shell>
  );
}
