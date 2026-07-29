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
import {
  describeInvoiceValidationError,
  validateInvoiceForCreate,
  InvoiceField,
} from "@/lib/invoice-validation";

// A red asterisk after a field's label — the mandatory-field affordance used
// throughout this form. Pairs with the "Optional" placeholder convention
// already used on genuinely optional fields (see the client and brand
// forms): mandatory fields get this marker, optional fields get that
// placeholder, and no field gets both.
function Required() {
  // `Label` lays its children out with `gap-2` (see `label.tsx`), so no
  // leading space is needed here to separate this from the field name.
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

// Maps each validated field to the DOM node its error should scroll to and
// highlight — in the same order the fields actually appear on the page, so
// "scroll to the first error" always means the first one visually, not just
// the first one `validateInvoiceForCreate` happened to check.
const FIELD_DOM_ID: Record<InvoiceField, string> = {
  brand: "field-brand",
  client: "field-client",
  companyName: "field-company-name",
  contactName: "field-contact-name",
  address: "field-address",
  billDate: "field-bill-date",
  dueDate: "field-due-date",
  currency: "field-currency",
  lineItems: "field-line-items",
};

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

  // Which mandatory fields failed the most recent "Create invoice" attempt.
  // Only ever populated on that path — "Save as draft" and editing
  // ("Save changes") never touch this.
  const [errors, setErrors] = useState<Partial<Record<InvoiceField, boolean>>>({});

  // A saved client's own record is read-only from here — `client` below is
  // always this invoice's own snapshot. When that client is missing a
  // mandatory field (most commonly no contact name, which the client form
  // itself marks Optional), this holds just the gaps the user fills in for
  // *this invoice*, so the saved record is never touched. Reset whenever
  // "Billed to" changes, so a patch typed for one client can't leak onto
  // the next one selected.
  const [clientPatch, setClientPatch] = useState<Partial<InvoiceClient>>({});

  const clearErrors = (fields: InvoiceField[]) => {
    setErrors((prev) => {
      if (!fields.some((f) => prev[f])) return prev;
      const next = { ...prev };
      fields.forEach((f) => delete next[f]);
      return next;
    });
  };

  const brand = brands.find((b) => b.id === brandId);
  const isManualClient = selectValue === MANUAL_CLIENT_VALUE;
  const selectedClient = isManualClient ? undefined : clients.find((c) => c.id === selectValue);

  // Which of the selected saved client's mandatory fields it doesn't
  // actually have — surfaced inline (below) for completion rather than
  // leaving "contact name required" with no field to type it into.
  const savedClientGaps = selectedClient
    ? {
        companyName: !selectedClient.companyName.trim(),
        contactName: !(selectedClient.name ?? "").trim(),
        address: !selectedClient.address.trim(),
      }
    : { companyName: false, contactName: false, address: false };
  const hasSavedClientGaps =
    !!selectedClient &&
    (savedClientGaps.companyName || savedClientGaps.contactName || savedClientGaps.address);

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
        name: clientPatch.name ?? selectedClient.name,
        companyName: clientPatch.companyName ?? selectedClient.companyName,
        address: clientPatch.address ?? selectedClient.address,
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
      if (isEdit) {
        // Editing keeps its own long-standing, narrower guard — an invoice
        // that was already valid enough to create can still be saved even
        // if, say, its client record has since lost its contact name.
        // Full mandatory-field validation below is a "Create invoice"-only
        // concern.
        const hasValidLine = items.some(
          (item) => item.description.trim() !== "" && item.amount > 0
        );
        if (!hasValidLine) {
          toast("Add at least one line item first");
          return;
        }
      } else {
        const result = validateInvoiceForCreate({
          brandId,
          clientSelected: selectValue !== "",
          client: {
            companyName: previewClient.companyName,
            name: previewClient.name,
            address: previewClient.address,
          },
          billDate,
          dueDate,
          currency,
          items,
        });
        if (!result.ok) {
          setErrors(Object.fromEntries(result.fields.map((f) => [f, true])));
          toast(describeInvoiceValidationError(result.fields));
          document
            .getElementById(FIELD_DOM_ID[result.fields[0]])
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        setErrors({});
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

    // `paidOn` never appears in this form's own UI — it's edited from the
    // invoice detail screen — but this save path can still invalidate it two
    // ways: "Save as draft" moves status off "paid", which must clear it
    // (a stale payment date on an unpaid invoice is worse than none), and
    // editing `billDate` forward past an already-recorded `paidOn` would
    // leave a payment date that precedes the bill it's for, the same
    // incoherent state `paid-on.ts` rejects when the date is entered
    // directly. Otherwise the existing value is carried through untouched.
    const paidOn =
      status === "paid" && existingInvoice?.paidOn && existingInvoice.paidOn >= billDate
        ? existingInvoice.paidOn
        : undefined;

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
      paidOn,
    };

    // `save` (from `useInvoices`) passes through `storage.saveInvoice`'s own
    // return value — `false` means the write didn't actually persist (e.g. a
    // full `localStorage` quota, which `storage.ts` has already toasted its
    // own clear failure message for). Toasting success and navigating away
    // regardless would tell the user this worked when it didn't, and take
    // them off the one screen still holding what they typed.
    const persisted = save(invoice);
    if (!persisted) return;

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
            <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.brand}>
              <Label className="text-xs text-muted-foreground">
                From (brand)
                <Required />
              </Label>
              <Select
                value={brandId}
                onValueChange={(v) => {
                  setBrandId(v);
                  clearErrors(["brand"]);
                }}
                disabled={isEdit}
              >
                <SelectTrigger
                  className="w-full text-sm"
                  aria-invalid={!!errors.brand}
                  aria-describedby={errors.brand ? "brand-error" : undefined}
                >
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
              {errors.brand && (
                <p id="brand-error" className="text-xs text-destructive">
                  Required
                </p>
              )}
              {!isEdit && brands.length === 0 && (
                <p className="text-xs text-destructive">
                  No brands yet.{" "}
                  <Link href="/brands/create" className="underline">
                    Create one first
                  </Link>
                </p>
              )}
            </div>
            <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.client}>
              <Label className="text-xs text-muted-foreground">
                Billed to
                <Required />
              </Label>
              <Select
                value={selectValue}
                onValueChange={(v) => {
                  setSelectValue(v);
                  setClientPatch({});
                  clearErrors(["client", "companyName", "contactName", "address"]);
                }}
              >
                <SelectTrigger
                  className="w-full text-sm"
                  aria-invalid={!!errors.client}
                  aria-describedby={errors.client ? "client-error" : undefined}
                >
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
              {errors.client && (
                <p id="client-error" className="text-xs text-destructive">
                  Required
                </p>
              )}
            </div>
          </div>

          {isManualClient && (
            <div className="border rounded-xl bg-card p-3 flex flex-col gap-3">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.companyName}>
                  <Label className="text-xs text-muted-foreground">
                    Company name
                    <Required />
                  </Label>
                  <Input
                    value={manualClient.companyName}
                    onChange={(e) => {
                      setManualClient((prev) => ({ ...prev, companyName: e.target.value }));
                      clearErrors(["companyName"]);
                    }}
                    placeholder="Acme Corp"
                    className="text-sm"
                    aria-invalid={!!errors.companyName}
                    aria-describedby={errors.companyName ? "company-name-error" : undefined}
                  />
                  {errors.companyName && (
                    <p id="company-name-error" className="text-xs text-destructive">
                      Required
                    </p>
                  )}
                </div>
                <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.contactName}>
                  <Label className="text-xs text-muted-foreground">
                    Contact name
                    <Required />
                  </Label>
                  <Input
                    value={manualClient.name ?? ""}
                    onChange={(e) => {
                      setManualClient((prev) => ({ ...prev, name: e.target.value }));
                      clearErrors(["contactName"]);
                    }}
                    placeholder="Priya Nair"
                    className="text-sm"
                    aria-invalid={!!errors.contactName}
                    aria-describedby={errors.contactName ? "contact-name-error" : undefined}
                  />
                  {errors.contactName && (
                    <p id="contact-name-error" className="text-xs text-destructive">
                      Required
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.address}>
                  <Label className="text-xs text-muted-foreground">
                    Address
                    <Required />
                  </Label>
                  <Textarea
                    value={manualClient.address}
                    onChange={(e) => {
                      setManualClient((prev) => ({ ...prev, address: e.target.value }));
                      clearErrors(["address"]);
                    }}
                    rows={2}
                    className="text-sm"
                    aria-invalid={!!errors.address}
                    aria-describedby={errors.address ? "address-error" : undefined}
                  />
                  {errors.address && (
                    <p id="address-error" className="text-xs text-destructive">
                      Required
                    </p>
                  )}
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
              <div className="flex gap-3 flex-wrap">
                <div className="flex-[1_1_200px] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">GST Number</Label>
                  <Input
                    value={manualClient.gstNumber ?? ""}
                    onChange={(e) =>
                      setManualClient((prev) => ({ ...prev, gstNumber: e.target.value }))
                    }
                    placeholder="Optional"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {hasSavedClientGaps && (
            <div className="border rounded-xl bg-card p-3 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedClient!.companyName || "This client"}&rsquo;s saved record is missing a
                few details — fill them in for this invoice. The saved client itself won&rsquo;t
                change.
              </p>
              <div className="flex gap-3 flex-wrap">
                {savedClientGaps.companyName && (
                  <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.companyName}>
                    <Label className="text-xs text-muted-foreground">
                      Company name
                      <Required />
                    </Label>
                    <Input
                      value={clientPatch.companyName ?? ""}
                      onChange={(e) => {
                        setClientPatch((prev) => ({ ...prev, companyName: e.target.value }));
                        clearErrors(["companyName"]);
                      }}
                      placeholder="Acme Corp"
                      className="text-sm"
                      aria-invalid={!!errors.companyName}
                      aria-describedby={errors.companyName ? "company-name-error" : undefined}
                    />
                    {errors.companyName && (
                      <p id="company-name-error" className="text-xs text-destructive">
                        Required
                      </p>
                    )}
                  </div>
                )}
                {savedClientGaps.contactName && (
                  <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.contactName}>
                    <Label className="text-xs text-muted-foreground">
                      Contact name
                      <Required />
                    </Label>
                    <Input
                      value={clientPatch.name ?? ""}
                      onChange={(e) => {
                        setClientPatch((prev) => ({ ...prev, name: e.target.value }));
                        clearErrors(["contactName"]);
                      }}
                      placeholder="Priya Nair"
                      className="text-sm"
                      aria-invalid={!!errors.contactName}
                      aria-describedby={errors.contactName ? "contact-name-error" : undefined}
                    />
                    {errors.contactName && (
                      <p id="contact-name-error" className="text-xs text-destructive">
                        Required
                      </p>
                    )}
                  </div>
                )}
              </div>
              {savedClientGaps.address && (
                <div className="flex-[1_1_200px] space-y-1.5" id={FIELD_DOM_ID.address}>
                  <Label className="text-xs text-muted-foreground">
                    Address
                    <Required />
                  </Label>
                  <Textarea
                    value={clientPatch.address ?? ""}
                    onChange={(e) => {
                      setClientPatch((prev) => ({ ...prev, address: e.target.value }));
                      clearErrors(["address"]);
                    }}
                    rows={2}
                    className="text-sm"
                    aria-invalid={!!errors.address}
                    aria-describedby={errors.address ? "address-error" : undefined}
                  />
                  {errors.address && (
                    <p id="address-error" className="text-xs text-destructive">
                      Required
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <div className="flex-[1_1_150px] space-y-1.5" id={FIELD_DOM_ID.billDate}>
              <Label className="text-xs text-muted-foreground">
                Bill date
                <Required />
              </Label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => {
                  setBillDate(e.target.value);
                  clearErrors(["billDate"]);
                }}
                className="text-sm"
                aria-invalid={!!errors.billDate}
                aria-describedby={errors.billDate ? "bill-date-error" : undefined}
              />
              {errors.billDate && (
                <p id="bill-date-error" className="text-xs text-destructive">
                  Required
                </p>
              )}
            </div>
            <div className="flex-[1_1_150px] space-y-1.5" id={FIELD_DOM_ID.dueDate}>
              <Label className="text-xs text-muted-foreground">
                Due date
                <Required />
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  clearErrors(["dueDate"]);
                }}
                className="text-sm"
                aria-invalid={!!errors.dueDate}
                aria-describedby={errors.dueDate ? "due-date-error" : undefined}
              />
              {errors.dueDate && (
                <p id="due-date-error" className="text-xs text-destructive">
                  Required
                </p>
              )}
            </div>
            {/* No `<Required />` marker here: the default value ("INR") means
               this Select can never actually reach the empty state its
               validation still checks for defensively — see the comment on
               `currency` in `invoice-validation.ts`. */}
            <div className="flex-[1_1_120px] space-y-1.5" id={FIELD_DOM_ID.currency}>
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

          <div className="space-y-1.5" id={FIELD_DOM_ID.lineItems}>
            <Label className="text-xs text-muted-foreground">
              Line items
              <Required />
            </Label>
            <LineItemsTable
              items={items}
              onChange={(next) => {
                setItems(next);
                clearErrors(["lineItems"]);
              }}
              currency={currency}
              invalid={!!errors.lineItems}
              aria-describedby={errors.lineItems ? "line-items-error" : undefined}
            />
            {errors.lineItems && (
              <p id="line-items-error" className="text-xs text-destructive">
                Add at least one line item with a description and an amount
              </p>
            )}
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
