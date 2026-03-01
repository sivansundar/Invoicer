"use client";

import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { Invoice, Brand } from "@/lib/types";
import { Download } from "lucide-react";
import { useState } from "react";

interface PDFDownloadButtonProps {
  invoice: Invoice;
  brand: Brand;
}

export function PDFDownloadButton({ invoice, brand }: PDFDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(
        <InvoicePDF invoice={invoice} brand={brand} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      size="sm"
      className="text-xs gap-1.5"
      onClick={handleDownload}
      disabled={generating}
    >
      <Download className="h-3.5 w-3.5" />
      {generating ? "Generating..." : "Download PDF"}
    </Button>
  );
}
