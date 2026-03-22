"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { LineItemsTable } from "./line-items-table";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { Invoice, LineItem, Currency } from "@/lib/types";
import { formatCurrency, cn } from "@/lib/utils";
import {
  getNextInvoiceNumber,
  incrementInvoiceNumber,
  saveInvoice,
  saveClient,
  getClients,
} from "@/lib/storage";
import { format } from "date-fns";

interface InvoiceFormProps {
  existingInvoice?: Invoice;
}

export function InvoiceForm({ existingInvoice }: InvoiceFormProps = {}) {
  const router = useRouter();
  const { brands } = useBrands();
  const { clients } = useClients();
  const isEdit = !!existingInvoice;

  const [brandId, setBrandId] = useState(existingInvoice?.brandId ?? "");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [saveClientChecked, setSaveClientChecked] = useState(false);
  const [currency, setCurrency] = useState<Currency>(
    existingInvoice?.currency ?? "INR"
  );
  const [billDate, setBillDate] = useState(
    existingInvoice?.billDate ?? format(new Date(), "yyyy-MM-dd")
  );
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate ?? "");
  const [clientName, setClientName] = useState(
    existingInvoice?.client.name ?? ""
  );
  const [clientCompany, setClientCompany] = useState(
    existingInvoice?.client.companyName ?? ""
  );
  const [clientAddress, setClientAddress] = useState(
    existingInvoice?.client.address ?? ""
  );
  const [clientEmail, setClientEmail] = useState(
    existingInvoice?.client.email ?? ""
  );
  const [clientGst, setClientGst] = useState(
    existingInvoice?.client.gstNumber ?? ""
  );
  const [notes, setNotes] = useState(existingInvoice?.notes ?? "");
  const [items, setItems] = useState<LineItem[]>(
    existingInvoice?.items ?? [
      { id: crypto.randomUUID(), description: "", amount: 0, tax: 0 },
    ]
  );
  const [errors, setErrors] = useState<{
    brandId?: boolean;
    clientCompany?: boolean;
    billDate?: boolean;
    dueDate?: boolean;
  }>({});
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = () => setIsDirty(true);

  const invoiceNumber = isEdit
    ? existingInvoice.invoiceNumber
    : brandId
    ? getNextInvoiceNumber(brandId)
    : "—";

  const handleClientSelect = (clientId: string) => {
    markDirty();
    setSelectedClientId(clientId);
    if (clientId === "manual") {
      setClientName("");
      setClientCompany("");
      setClientAddress("");
      setClientEmail("");
      setClientGst("");
      setSaveClientChecked(false);
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setClientName(client.name ?? "");
    setClientCompany(client.companyName);
    setClientAddress(client.address);
    setClientEmail(client.email ?? "");
    setClientGst(client.gstNumber ?? "");
    setSaveClientChecked(false);
  };

  const { subtotal, totalTax, total } = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const totalTax = items.reduce(
      (sum, item) => sum + (item.amount * item.tax) / 100,
      0
    );
    return { subtotal, totalTax, total: subtotal + totalTax };
  }, [items]);

  const handleSubmit = (status: "draft" | "sent") => {
    if (status !== "draft") {
      const newErrors = {
        brandId: !brandId,
        clientCompany: !clientCompany,
        billDate: !billDate,
        dueDate: !dueDate,
      };
      const hasErrors = Object.values(newErrors).some(Boolean);
      if (hasErrors) {
        setErrors(newErrors);
        const firstErrorId = newErrors.brandId
          ? "field-brand"
          : newErrors.clientCompany
          ? "field-company"
          : newErrors.billDate
          ? "field-billdate"
          : "field-duedate";
        document
          .getElementById(firstErrorId)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    const invoice: Invoice = {
      id: isEdit ? existingInvoice.id : crypto.randomUUID(),
      invoiceNumber: isEdit
        ? existingInvoice.invoiceNumber
        : getNextInvoiceNumber(brandId),
      brandId,
      currency,
      status,
      billDate,
      dueDate,
      client: {
        name: clientName,
        companyName: clientCompany,
        address: clientAddress,
        email: clientEmail || undefined,
        gstNumber: clientGst || undefined,
      },
      items,
      subtotal,
      totalTax,
      total,
      notes: notes || undefined,
      createdAt: isEdit ? existingInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveInvoice(invoice);

    if (!isEdit) {
      incrementInvoiceNumber(brandId);
    }

    if (!isEdit && saveClientChecked) {
      const existing = getClients().find(
        (c) => c.companyName.toLowerCase() === clientCompany.toLowerCase()
      );
      if (!existing) {
        saveClient({
          id: crypto.randomUUID(),
          name: clientName,
          companyName: clientCompany,
          address: clientAddress,
          email: clientEmail || undefined,
          gstNumber: clientGst || undefined,
          createdAt: new Date().toISOString(),
        });
      }
    }

    router.push(`/invoices/${invoice.id}`);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Brand Selection + Invoice Number */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Invoice Details
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2" id="field-brand">
            <Label className="text-xs">Brand <span className="text-destructive">*</span></Label>
            {isEdit ? (
              <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm">
                {brands.find((b) => b.id === brandId)?.name ?? brandId}
              </div>
            ) : (
              <Select
                value={brandId}
                onValueChange={(v) => {
                  setBrandId(v);
                  markDirty();
                  if (v) setErrors((prev) => ({ ...prev, brandId: false }));
                }}
              >
                <SelectTrigger className={cn("text-sm", errors.brandId && "border-destructive")}>
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isEdit && brands.length === 0 && (
              <p className="text-[10px] text-destructive">
                No brands configured.{" "}
                <a href="/brands/create" className="underline">
                  Create one first
                </a>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Invoice Number</Label>
            <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm tabular-nums">
              {invoiceNumber}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Currency <span className="text-destructive">*</span></Label>
          <Select
            value={currency}
            onValueChange={(v) => { setCurrency(v as Currency); markDirty(); }}
          >
            <SelectTrigger className="text-sm w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INR" className="text-sm">
                ₹ — Indian Rupee
              </SelectItem>
              <SelectItem value="USD" className="text-sm">
                $ — US Dollar
              </SelectItem>
              <SelectItem value="SGD" className="text-sm">
                S$ — Singapore Dollar
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2" id="field-billdate">
            <Label className="text-xs">Bill Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={billDate}
              onChange={(e) => {
                setBillDate(e.target.value);
                markDirty();
                if (e.target.value) setErrors((prev) => ({ ...prev, billDate: false }));
              }}
              className={cn("text-sm", errors.billDate && "border-destructive")}
              required
            />
          </div>
          <div className="space-y-2" id="field-duedate">
            <Label className="text-xs">Due Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                markDirty();
                if (e.target.value) setErrors((prev) => ({ ...prev, dueDate: false }));
              }}
              className={cn("text-sm", errors.dueDate && "border-destructive")}
              required
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Billed To */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Billed To
        </h3>
        <div className="grid gap-4">
          {clients.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Select Saved Client</Label>
              <Select
                value={selectedClientId}
                onValueChange={handleClientSelect}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose a saved client or enter manually" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual" className="text-sm">
                    Enter manually
                  </SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-sm">
                      {c.companyName}{c.name ? ` — ${c.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Contact Name</Label>
              <Input
                value={clientName}
                onChange={(e) => { setClientName(e.target.value); markDirty(); }}
                placeholder="John Doe"
                className="text-sm"
              />
            </div>
            <div className="space-y-2" id="field-company">
              <Label className="text-xs">Company Name <span className="text-destructive">*</span></Label>
              <Input
                value={clientCompany}
                onChange={(e) => {
                  setClientCompany(e.target.value);
                  markDirty();
                  if (e.target.value) setErrors((prev) => ({ ...prev, clientCompany: false }));
                }}
                placeholder="Acme Corp"
                className={cn("text-sm", errors.clientCompany && "border-destructive")}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Address</Label>
            <Textarea
              value={clientAddress}
              onChange={(e) => { setClientAddress(e.target.value); markDirty(); }}
              placeholder="Client address"
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => { setClientEmail(e.target.value); markDirty(); }}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">GST Number</Label>
              <Input
                value={clientGst}
                onChange={(e) => { setClientGst(e.target.value); markDirty(); }}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
          </div>
          {!isEdit && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="saveClient"
                checked={saveClientChecked}
                onCheckedChange={(checked) =>
                  setSaveClientChecked(checked === true)
                }
              />
              <Label
                htmlFor="saveClient"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Save to clients if not already saved
              </Label>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Line Items */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Services
        </h3>
        <LineItemsTable items={items} onChange={(items) => { setItems(items); markDirty(); }} currency={currency} />
      </div>

      <Separator />

      {/* Summary */}
      <div className="flex justify-end">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">
              {formatCurrency(subtotal, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums">
              {formatCurrency(totalTax, currency)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatCurrency(total, currency)}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-xs">Notes / Terms</Label>
        <Textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          placeholder="Payment terms, notes, etc."
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isEdit ? (
          <>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => handleSubmit("draft")}
            >
              Save Changes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleSubmit("sent")}
            >
              Mark as Sent
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => handleSubmit("sent")}
            >
              Create Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleSubmit("draft")}
              disabled={!isDirty}
            >
              Save as Draft
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() =>
            router.push(isEdit ? `/invoices/${existingInvoice.id}` : "/")
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
