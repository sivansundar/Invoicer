"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";
import { Invoice, BrandSnapshot } from "@/lib/types";

interface PDFPreviewDialogProps {
  invoice: Invoice;
  /** Always `invoice.brandSnapshot`, as for `PDFDownloadButton`. */
  snapshot: BrandSnapshot;
}

/** "Full screen" button that renders the same PDF the client downloads, in a near-full-screen modal. */
export function PDFPreviewDialog({ invoice, snapshot }: PDFPreviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const openPreview = async () => {
    setOpen(true);
    setFailed(false);
    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} snapshot={snapshot} />).toBlob();
      setUrl(URL.createObjectURL(blob));
    } catch {
      setFailed(true);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (url) URL.revokeObjectURL(url);
      setUrl(null);
    }
    setOpen(next);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openPreview}>
        <Maximize2 className="size-3.5" />
        Full screen
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[min(1100px,calc(100%-2rem))] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-sm">{invoice.invoiceNumber}</DialogTitle>
            <DialogDescription className="sr-only">PDF preview of this invoice</DialogDescription>
          </DialogHeader>
          {url ? (
            <iframe src={url} title={`${invoice.invoiceNumber} PDF`} className="flex-1 w-full border-0" />
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              {failed ? "Couldn't render the PDF. Try again." : "Rendering PDF…"}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
