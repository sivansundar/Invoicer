"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { FormSkeleton } from "@/components/ui/page-skeletons";
import { useInvoices } from "@/hooks/use-invoices";

export default function EditInvoicePage() {
  const params = useParams();
  const { invoices, loading } = useInvoices();

  const id = params.id as string;
  const invoice = useMemo(() => invoices.find((i) => i.id === id) ?? null, [invoices, id]);

  // See brands/[id]/edit for why this precedes the not-found check.
  if (loading) return <FormSkeleton fields={7} />;

  if (!invoice) {
    return <p className="text-sm text-muted-foreground p-6">Invoice not found.</p>;
  }

  return <InvoiceForm existingInvoice={invoice} />;
}
