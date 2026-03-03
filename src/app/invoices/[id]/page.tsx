"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Shell } from "@/components/layout/shell";
import { InvoiceView } from "@/components/invoices/invoice-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Invoice, Brand, InvoiceStatus } from "@/lib/types";
import { getInvoice, saveInvoice, deleteInvoice, getBrand } from "@/lib/storage";
import {
  ArrowLeft,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react";

const PDFDownloadButton = dynamic(
  () => import("./pdf-download-button").then((m) => ({ default: m.PDFDownloadButton })),
  { ssr: false, loading: () => <Button size="sm" className="text-xs" disabled>Loading PDF...</Button> }
);

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadData = useCallback(() => {
    const inv = getInvoice(params.id as string);
    setInvoice(inv);
    if (inv) {
      setBrand(getBrand(inv.brandId));
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = (status: InvoiceStatus) => {
    if (!invoice) return;
    const updated = { ...invoice, status, updatedAt: new Date().toISOString() };
    saveInvoice(updated);
    setInvoice(updated);
  };

  const handleDelete = () => {
    if (!invoice) return;
    deleteInvoice(invoice.id);
    router.push("/");
  };

  if (loading) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </Shell>
    );
  }

  if (!invoice || !brand) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Invoice not found</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{invoice.invoiceNumber}</h1>
            <p className="text-xs text-muted-foreground">
              {brand.name} &rarr; {invoice.client.companyName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => router.push(`/invoices/${invoice.id}/edit`)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <PDFDownloadButton invoice={invoice} brand={brand} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                Status
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["draft", "sent", "paid", "overdue"] as InvoiceStatus[]).map(
                (status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => updateStatus(status)}
                    className="text-xs capitalize"
                  >
                    Mark as {status}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <InvoiceView invoice={invoice} brand={brand} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Invoice</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete {invoice.invoiceNumber}? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
