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
  SelectSeparator,
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

// Sentinel "Billed to" select value for the manual-entry option. Never a
// real client id (those are `crypto.randomUUID()`), so it can't collide.
const MANUAL_CLIENT_VALUE = "manual";

export function InvoiceForm({ existingInvoice }: InvoiceFormProps = {}) {
  const router = useRouter();
  const { brands } = useBrands();
  const { clients } = useClients();
  const { invoices, save } = useInvoices();
  const isEdit = !!existingInvoice;

  const [brandId, setBrandId] = useState(existingInvoice?.brandId ?? "");
  // Drives the "Billed to" select. Holds a saved client's id, the manual-entry
  // sentinel, or "" when nothing has been chosen yet. A `clientId: null` +
  // populated `client` snapshot is a combination the model already supports —
  // it's exactly what the v1→v2 migration produces for a legacy invoice whose
  // client record no longer exists — so manual entry needs no new shape here.
  const [selectValue, setSelectValue] = useState<string>(
    existingInvoice ? existingInvoice.clientId ?? MANUAL_CLIENT_VALUE : ""
  );
  const [manualClient, setManualClient] = useState<InvoiceClient>(
    existingInvoice && existingInvoice.clientId === null
      ? existingInvoice.client
      : { companyName: "", address: "" }
  );
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
  const isManualClient = selectValue === MANUAL_CLIENT_VALUE;
  const selectedClient = isManualClient ? undefined : clients.find((c) => c.id === selectValue);

  // Copies the whole saved client record into the embedded snapshot — the
  // two fields (`clientId` and `client`) coexist by design: `clientId` is
  // the live back-reference, `client` is what actually renders on the
  // invoice even if the client record changes or is deleted later. Manual
  // entry is the same idea with no back-reference at all: `clientId` stays
  // `null` and `client` carries whatever was typed.
  const previewClient: InvoiceClient = isManualClient
    ? manualClient
    : selectedClient
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

    // Editing an invoice must never silently change its status — only an
    // explicit "Save as draft" click may revert it. The primary button
    // preserves whatever status the invoice already has.
    const status: InvoiceStatus = asDraft ? "draft" : isEdit ? existingInvoice.status : "sent";

    // An invoice cannot be numbered or snapshotted without a brand — even a
    // draft needs its prefix. Branching on `isEdit` here (rather than a
    // `brand!` assertion after a compound early-return guard) lets
    // TypeScript actually narrow `brand` to `Brand` in the `else`, so a
    // future edit to the surrounding conditions can't silently invalidate an
    // assertion the compiler was never checking. This also fixes a dead
    // click: "Save as draft" with no brand chosen used to hit that early
    // return with no feedback at all — now both buttons toast the same way
    // the line-item check above does.
    let invoiceNumber: string;
    let brandSnapshot: BrandSnapshot;
    if (isEdit) {
      invoiceNumber = existingInvoice.invoiceNumber;
      brandSnapshot = existingInvoice.brandSnapshot;
    } else {
      if (!brand) {
        toast("Select a brand first");
        return;
      }
      invoiceNumber = nextInvoiceNumber(brand, invoices);
      brandSnapshot = snapshotFromBrand(brand);
    }

    const clientId = isManualClient ? null : selectValue || null;
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
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.companyName}
                    </SelectItem>
                  ))}
                  {clients.length > 0 && <SelectSeparator />}
                  <SelectItem value={MANUAL_CLIENT_VALUE}>Enter manually…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isManualClient && (
            <div className="border rounded-xl bg-card p-3 flex flex-col gap-3">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_200px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Company name</Label>
                  <Input
                    value={manualClient.companyName}
                    onChange={(e) =>
                      setManualClient((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                    placeholder="Acme Corp"
                    className="text-sm"
                  />
                </div>
                <div className="flex-[1_1_200px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Contact name</Label>
                  <Input
                    value={manualClient.name ?? ""}
                    onChange={(e) =>
                      setManualClient((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Optional"
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_200px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Textarea
                    value={manualClient.address}
                    onChange={(e) =>
                      setManualClient((prev) => ({ ...prev, address: e.target.value }))
                    }
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="flex-[1_1_200px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={manualClient.email ?? ""}
                    onChange={(e) =>
                      setManualClient((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="Optional"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

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
