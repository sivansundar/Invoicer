"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { useInvoices } from "@/hooks/use-invoices";
import { duplicateTemplate } from "@/lib/invoice-detail";

// `?from=<invoice id>` pre-fills the form from that invoice (Duplicate).
function CreateInvoiceForm() {
  const from = useSearchParams().get("from");
  const { invoices } = useInvoices();
  const template = useMemo(() => {
    const source = from ? invoices.find((i) => i.id === from) : undefined;
    return source ? duplicateTemplate(source) : undefined;
  }, [from, invoices]);

  if (from && !template) {
    return <p className="text-sm text-muted-foreground p-6">Invoice to duplicate not found.</p>;
  }
  return <InvoiceForm key={from ?? "new"} template={template} />;
}

export default function CreateInvoicePage() {
  return (
    <Shell>
      <Suspense>
        <CreateInvoiceForm />
      </Suspense>
    </Shell>
  );
}
