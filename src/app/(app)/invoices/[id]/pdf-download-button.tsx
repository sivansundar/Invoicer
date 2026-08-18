"use client";

import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { Invoice, BrandSnapshot } from "@/lib/types";
import * as storage from "@/lib/storage";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PDFDownloadButtonProps {
  invoice: Invoice;
  /** Brand details frozen at invoice-creation time — always `invoice.brandSnapshot`. */
  snapshot: BrandSnapshot;
}

/**
 * `@react-pdf/renderer` embeds `snapshot.logo` synchronously and cannot
 * await inside a render, so a path-backed logo has to become a data URL
 * before `pdf()` is called. This is the only `pdf()` call site, which is why
 * it happens here and neither design component changes.
 *
 * A failure here must not fail the download: the logo is missing from a
 * document the client may already have seen, which is bad, but no PDF at all
 * is worse.
 */
async function withResolvedLogo(snapshot: BrandSnapshot): Promise<BrandSnapshot> {
  if (!snapshot.logoPath) return snapshot;

  try {
    const url = await storage.getLogoUrl(snapshot.logoPath);
    const response = await fetch(url);
    if (!response.ok) return { ...snapshot, logo: undefined };

    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { ...snapshot, logo: `data:image/png;base64,${btoa(binary)}` };
  } catch {
    return { ...snapshot, logo: undefined };
  }
}

export function PDFDownloadButton({ invoice, snapshot }: PDFDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const printable = await withResolvedLogo(snapshot);
      const blob = await pdf(
        <InvoicePDF invoice={invoice} snapshot={printable} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Failed to generate PDF. Please try again.");
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
