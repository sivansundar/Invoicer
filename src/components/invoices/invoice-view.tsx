"use client";

import { Invoice, Brand } from "@/lib/types";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

interface InvoiceViewProps {
  invoice: Invoice;
  brand: Brand;
}

export function InvoiceView({ invoice, brand }: InvoiceViewProps) {
  const cur = invoice.currency ?? "INR";
  const fmt = (n: number) => formatCurrency(n, cur, 2);

  return (
    <div className="max-w-3xl mx-auto bg-card border border-border rounded-lg p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          {brand.logo && (
            <img
              src={brand.logo}
              alt={brand.name}
              className="h-10 w-10 object-contain"
            />
          )}
          <div>
            <h2 className="text-sm font-bold">{brand.name}</h2>
            <p className="text-[10px] text-muted-foreground whitespace-pre-line">
              {brand.address}
            </p>
            {brand.gstNumber && (
              <p className="text-[10px] text-muted-foreground">
                GST: {brand.gstNumber}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-bold uppercase tracking-wider">
            Invoice
          </h1>
          <p className="text-sm font-medium tabular-nums mt-1">
            {invoice.invoiceNumber}
          </p>
          <StatusBadge status={invoice.status} />
        </div>
      </div>

      <Separator />

      {/* Dates + Client */}
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Bill Date
            </p>
            <p className="text-xs tabular-nums">
              {format(new Date(invoice.billDate), "dd MMM yyyy")}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Due Date
            </p>
            <p className="text-xs tabular-nums">
              {format(new Date(invoice.dueDate), "dd MMM yyyy")}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Billed To
          </p>
          <p className="text-xs font-medium">{invoice.client.companyName}</p>
          <p className="text-xs text-muted-foreground">
            {invoice.client.name}
          </p>
          {invoice.client.address && (
            <p className="text-xs text-muted-foreground whitespace-pre-line">
              {invoice.client.address}
            </p>
          )}
          {invoice.client.gstNumber && (
            <p className="text-[10px] text-muted-foreground mt-1">
              GST: {invoice.client.gstNumber}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Line Items */}
      <div>
        <div className="grid grid-cols-[1fr_100px_80px_100px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-2 border-b border-border">
          <span>Description</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Tax</span>
          <span className="text-right">Total</span>
        </div>
        {invoice.items.map((item) => {
          const taxAmount = (item.amount * item.tax) / 100;
          return (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_100px_80px_100px] gap-2 py-2.5 border-b border-border/50 text-xs"
            >
              <span>{item.description}</span>
              <span className="text-right tabular-nums">
                {fmt(item.amount)}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {item.tax}%
              </span>
              <span className="text-right tabular-nums">
                {fmt(item.amount + taxAmount)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">
              {fmt(invoice.subtotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums">
              {fmt(invoice.totalTax)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-sm">
            <span>Total</span>
            <span className="tabular-nums">
              {fmt(invoice.total)}
            </span>
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <Separator />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Payment Details
        </p>
        <div className="flex justify-between text-xs">
          {/* Left column: Account Name, Bank, Branch */}
          <table className="border-collapse">
            <tbody>
              <tr>
                <td className="text-muted-foreground pr-6 py-0.5">Account Name</td>
                <td className="py-0.5">{brand.bankDetails.accountName}</td>
              </tr>
              <tr>
                <td className="text-muted-foreground pr-6 py-0.5">Bank</td>
                <td className="py-0.5">{brand.bankDetails.bankName}</td>
              </tr>
              {brand.bankDetails.branch && (
                <tr>
                  <td className="text-muted-foreground pr-6 py-0.5">Branch</td>
                  <td className="py-0.5">{brand.bankDetails.branch}</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Right column: Account Number, IFSC, UPI */}
          <table className="border-collapse">
            <tbody>
              <tr>
                <td className="text-muted-foreground pr-6 py-0.5">Account Number</td>
                <td className="py-0.5 tabular-nums">{brand.bankDetails.accountNumber}</td>
              </tr>
              <tr>
                <td className="text-muted-foreground pr-6 py-0.5">IFSC</td>
                <td className="py-0.5">{brand.bankDetails.ifscCode}</td>
              </tr>
              {brand.bankDetails.upiId && (
                <tr>
                  <td className="text-muted-foreground pr-6 py-0.5">UPI</td>
                  <td className="py-0.5">{brand.bankDetails.upiId}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">
              {invoice.notes}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
