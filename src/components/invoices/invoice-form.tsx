"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoicePreview } from "./invoice-preview";
import { LineItemsTable } from "./line-items-table";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { Invoice, InvoiceClient, InvoiceStatus, LineItem, Currency, BrandSnapshot } from "@/lib/types";
import { computeTotals } from "@/lib/invoice-preview";
import { nextInvoiceNumber } from "@/lib/storage";
import { snapshotFromBrand } from "@/lib/migrate";
import { paletteColorForIndex } from "@/lib/palette";

interface InvoiceFormProps {
  existingInvoice?: Invoice;
}

// Shown in the live preview before a brand has been chosen on a new
// invoice — never persisted, so it doesn't need real bank details.
const EMPTY_SNAPSHOT: BrandSnapshot = {
  name: "",
  address: "",
  invoicePrefix: "",
  accentColor: paletteColorForIndex(0),
  bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
};

export function InvoiceForm({ existingInvoice }: InvoiceFormProps = {}) {
  const router = useRouter();
  const { brands } = useBrands();
  const { clients } = useClients();
  const { invoices, save } = useInvoices();
  const isEdit = !!existingInvoice;

  const [brandId, setBrandId] = useState(existingInvoice?.brandId ?? "");
  const [clientId, setClientId] = useState<string | null>(existingInvoice?.clientId ?? null);
  const [currency, setCurrency] = useState<Currency>(existingInvoice?.currency ?? "INR");
  const [billDate, setBillDate] = useState(
    existingInvoice?.billDate ?? format(new Date(), "yyyy-MM-dd")
  );
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate ?? "");
  const [notes, setNotes] = useState(existingInvoice?.notes ?? "");
  const [items, setItems] = useState<LineItem[]>(
    existingInvoice?.items ?? [{ id: crypto.randomUUID(), description: "", amount: 0, tax: 0 }]
  );

  const brand = brands.find((b) => b.id === brandId);
  const selectedClient = clients.find((c) => c.id === clientId);

  // Copies the whole saved client record into the embedded snapshot — the
  // two fields (`clientId` and `client`) coexist by design: `clientId` is
  // the live back-reference, `client` is what actually renders on the
  // invoice even if the client record changes or is deleted later.
  const previewClient: InvoiceClient = selectedClient
    ? {
        name: selectedClient.name,
        companyName: selectedClient.companyName,
        address: selectedClient.address,
        email: selectedClient.email,
        gstNumber: selectedClient.gstNumber,
      }
    : existingInvoice?.client ?? { companyName: "", address: "" };

  // The brand — and therefore the invoice number and frozen snapshot — is
  // locked once an invoice exists; only a brand chosen at creation time can
  // ever number it.
  const previewNumber = isEdit
    ? existingInvoice.invoiceNumber
    : brand
    ? nextInvoiceNumber(brand, invoices)
    : "—";

  const previewSnapshot: BrandSnapshot = isEdit
    ? existingInvoice.brandSnapshot
    : brand
    ? snapshotFromBrand(brand)
    : EMPTY_SNAPSHOT;

  const handleSave = (asDraft: boolean) => {
    if (!asDraft) {
      const hasValidLine = items.some(
        (item) => item.description.trim() !== "" && item.amount > 0
      );
      if (!hasValidLine) {
        toast("Add at least one line item first");
        return;
      }
    }

    if (!isEdit && !brand) return;

    // Editing an invoice must never silently change its status — only an
    // explicit "Save as draft" click may revert it. The primary button
    // preserves whatever status the invoice already has.
    const status: InvoiceStatus = asDraft ? "draft" : isEdit ? existingInvoice.status : "sent";
    const invoiceNumber = isEdit ? existingInvoice.invoiceNumber : nextInvoiceNumber(brand!, invoices);
    const brandSnapshot = isEdit ? existingInvoice.brandSnapshot : snapshotFromBrand(brand!);
    const { subtotal, totalTax, total } = computeTotals(items);

    const invoice: Invoice = {
      id: isEdit ? existingInvoice.id : crypto.randomUUID(),
      invoiceNumber,
      brandId,
      currency,
      status,
      billDate,
      dueDate,
      client: previewClient,
      items,
      subtotal,
      totalTax,
      total,
      notes: notes || undefined,
      createdAt: isEdit ? existingInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      brandSnapshot,
      clientId,
      reminders: isEdit ? existingInvoice.reminders : [],
      followupsPaused: isEdit ? existingInvoice.followupsPaused : false,
    };

    save(invoice);
    toast(
      asDraft
        ? "Draft saved — finish it anytime"
        : `${invoice.invoiceNumber} sent to ${invoice.client.companyName}`
    );
    router.push("/");
  };

  return (
    <div className="flex flex-wrap items-stretch flex-1 min-h-0">
      {/* Left pane */}
      <div className="flex-[1_1_460px] min-w-0 p-6 flex flex-col gap-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" />
            All invoices
          </Link>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] mt-3">
            {isEdit ? "Edit invoice" : "New invoice"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Number <span className="font-mono">{previewNumber}</span> is assigned automatically.
          </p>
        </div>

        <div className="flex flex-col gap-5 max-w-[580px]">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-[1_1_200px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">From (brand)</Label>
              <Select value={brandId} onValueChange={setBrandId} disabled={isEdit}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isEdit && brands.length === 0 && (
                <p className="text-xs text-destructive">
                  No brands yet.{" "}
                  <Link href="/brands/create" className="underline">
                    Create one first
                  </Link>
                </p>
              )}
            </div>
            <div className="flex-[1_1_200px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Billed to</Label>
              <Select value={clientId ?? ""} onValueChange={setClientId}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && (
                <p className="text-xs text-destructive">
                  No clients yet.{" "}
                  <Link href="/clients/create" className="underline">
                    Add one first
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-[1_1_150px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bill date</Label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex-[1_1_150px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex-[1_1_120px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">₹ INR</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="SGD">S$ SGD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Line items</Label>
            <LineItemsTable items={items} onChange={setItems} currency={currency} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, a thank-you, anything."
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => handleSave(true)}>
              Save as draft
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isEdit && !brand}
              onClick={() => handleSave(false)}
            >
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          </div>
        </div>
      </div>

      {/* Right pane: live client-facing preview */}
      <div className="flex-[1_1_508px] min-w-[508px] bg-muted border-l p-6">
        <div className="mb-4">
          <p className="text-sm font-medium">Live preview</p>
          <p className="text-[13px] text-muted-foreground">Updates as you type</p>
        </div>
        <InvoicePreview
          snapshot={previewSnapshot}
          client={previewClient}
          invoiceNumber={previewNumber}
          billDate={billDate}
          dueDate={dueDate}
          items={items}
          currency={currency}
          notes={notes || undefined}
          isPaid={isEdit ? existingInvoice.status === "paid" : false}
        />
      </div>
    </div>
  );
}
