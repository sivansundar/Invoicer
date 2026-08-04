"use client";

import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { Invoice, BrandSnapshot } from "@/lib/types";
import { Download } from "lucide-react";
import { useState } from "react";

interface PDFDownloadButtonProps {
  invoice: Invoice;
  /** Brand details frozen at invoice-creation time — always `invoice.brandSnapshot`. */
  snapshot: BrandSnapshot;
}

export function PDFDownloadButton({ invoice, snapshot }: PDFDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <InvoicePDF invoice={invoice} snapshot={snapshot} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleDownload}
      disabled={generating}
    >
      <Download className="size-3.5" />
      {generating ? "Generating…" : "Download PDF"}
    </Button>
  );
}
