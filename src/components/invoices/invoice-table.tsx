"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { Invoice, Brand } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

interface InvoiceTableProps {
  invoices: Invoice[];
  brands: Brand[];
}

export function InvoiceTable({ invoices, brands }: InvoiceTableProps) {
  const router = useRouter();
  const getBrandName = (brandId: string) =>
    brands.find((b) => b.id === brandId)?.name ?? "Unknown";

  const sorted = [...invoices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No invoices yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create your first invoice to get started
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] uppercase tracking-wider">
            Invoice
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider">
            Brand
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider">
            Client
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider">
            Date
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider">
            Status
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-right">
            Amount
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((inv) => (
          <TableRow
            key={inv.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/invoices/${inv.id}`)}
          >
            <TableCell className="text-xs font-medium tabular-nums">
              {inv.invoiceNumber}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {getBrandName(inv.brandId)}
            </TableCell>
            <TableCell className="text-xs">
              {inv.client.companyName}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              {format(new Date(inv.billDate), "dd MMM yyyy")}
            </TableCell>
            <TableCell>
              <StatusBadge status={inv.status} />
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums font-medium">
              {formatCurrency(inv.total, inv.currency ?? "INR")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
