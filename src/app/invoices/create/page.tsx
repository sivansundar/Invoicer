"use client";

import { Shell } from "@/components/layout/shell";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default function CreateInvoicePage() {
  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-lg font-bold">New Invoice</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Create and send an invoice
        </p>
      </div>
      <InvoiceForm />
    </Shell>
  );
}
