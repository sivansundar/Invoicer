"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { useInvoices } from "@/hooks/use-invoices";

export default function EditInvoicePage() {
  const params = useParams();
  const { invoices } = useInvoices();

  const id = params.id as string;
  const invoice = useMemo(() => invoices.find((i) => i.id === id) ?? null, [invoices, id]);

  if (!invoice) {
    return <p className="text-sm text-muted-foreground p-6">Invoice not found.</p>;
  }

  return <InvoiceForm existingInvoice={invoice} />;
}
