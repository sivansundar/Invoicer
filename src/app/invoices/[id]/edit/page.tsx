"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { useInvoices } from "@/hooks/use-invoices";
import { usePermissions } from "@/hooks/use-permissions";

export default function EditInvoicePage() {
  const params = useParams();
  const { invoices } = useInvoices();

  const id = params.id as string;
  const invoice = useMemo(() => invoices.find((i) => i.id === id) ?? null, [invoices, id]);

  const { canEdit } = usePermissions();

  if (invoice && !canEdit(invoice.brandId, "invoices")) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">You have view-only access to this invoice.</p>
      </Shell>
    );
  }

  if (!invoice) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">Invoice not found.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <InvoiceForm existingInvoice={invoice} />
    </Shell>
  );
}
