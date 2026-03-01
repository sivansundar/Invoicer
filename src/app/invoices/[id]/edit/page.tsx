"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { Button } from "@/components/ui/button";
import { Invoice } from "@/lib/types";
import { getInvoice } from "@/lib/storage";
import { ArrowLeft } from "lucide-react";

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inv = getInvoice(params.id as string);
    setInvoice(inv);
    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </Shell>
    );
  }

  if (!invoice) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Invoice not found.</p>
      </Shell>
    );
  }

  if (invoice.status !== "draft") {
    return (
      <Shell>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Only draft invoices can be edited.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => router.push(`/invoices/${invoice.id}`)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Invoice
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3 mb-8">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/invoices/${invoice.id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Edit Invoice</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {invoice.invoiceNumber} &mdash; Draft
          </p>
        </div>
      </div>
      <InvoiceForm existingInvoice={invoice} />
    </Shell>
  );
}
