"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { toast } from "sonner";
import { Bell, Check, ChevronLeft } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { StatusBadge } from "@/components/invoices/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrands } from "@/hooks/use-brands";
import { useTemplates } from "@/hooks/use-templates";
import { cadenceLabel, fillTemplate, templateContext } from "@/lib/followups";
import { taxLabel } from "@/lib/invoice-preview";
import { daysLate, effectiveStatus } from "@/lib/dashboard";
import { canMarkSent, dueLine, followupPillLabel, nextSendLine, resolveFollowupState } from "@/lib/invoice-detail";
import { FEATURES } from "@/lib/features";
import { validatePaidOn } from "@/lib/paid-on";
import { cn, formatCurrency } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import type { FollowupConfig, Invoice } from "@/lib/types";

const PDFDownloadButton = dynamic(
  () => import("./pdf-download-button").then((m) => ({ default: m.PDFDownloadButton })),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
);

// A brand-less follow-up config (only reachable if the brand backing this
// invoice was deleted after the invoice was issued — deleteBrand doesn't
// cascade). Disabled so resolveFollowupState falls through to "off" rather
// than throwing on a missing brand.followup.
const NO_BRAND_CONFIG: FollowupConfig = {
  enabled: false,
  mode: "weekly",
  weekday: 1,
  time: "09:00",
  repeat: "week",
  templateId: "",
  stopAfter: 0,
};

function formatDate(value: string): string {
  return formatStoredDate(value, "dd MMM yyyy");
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { invoices, save, remove } = useInvoices();
  const { brands } = useBrands();
  const { templates } = useTemplates();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const id = params.id as string;
  const invoice = useMemo(() => invoices.find((i) => i.id === id) ?? null, [invoices, id]);
  const brand = useMemo(() => brands.find((b) => b.id === invoice?.brandId), [brands, invoice]);

  if (!invoice) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">Invoice not found.</p>
      </Shell>
    );
  }

  const currency = invoice.currency ?? "INR";
  const brandName = brand?.name ?? invoice.brandSnapshot.name;
  const config = brand?.followup ?? NO_BRAND_CONFIG;
  const template = templates.find((t) => t.id === config.templateId);

  const line = dueLine(invoice, daysLate(invoice));
  const followupState = resolveFollowupState(invoice, config);
  const showFollowups =
    FEATURES.followups && (invoice.status !== "draft" || invoice.reminders.length > 0);

  // `save`/`remove` (from `useInvoices`) pass through `storage.ts`'s own
  // return value — `false` means the write didn't actually persist (e.g. a
  // full `localStorage` quota, which `storage.ts` has already toasted its
  // own clear failure message for). Every handler below checks it and bails
  // before its own success toast or any other side effect (closing a dialog,
  // navigating away) — the invoice on screen must keep showing what's
  // actually saved, not what the user just tried to save. "Mark as paid" is
  // the sharpest case: toasting an amount "in the bank" that was never
  // actually recorded is the worst version of this bug.
  const handleMarkSent = () => {
    if (!canMarkSent(invoice)) {
      toast("Add a due date before marking this sent");
      return;
    }
    const updated: Invoice = { ...invoice, status: "sent", updatedAt: new Date().toISOString() };
    if (!save(updated)) return;
    toast(`${invoice.invoiceNumber} marked as sent`);
  };

  const handleMarkPaid = () => {
    // Defaults `paidOn` to today — one click, no friction. Editable
    // afterwards from the "Paid on" field below: you mark an invoice paid
    // when you *notice*, not necessarily when the money actually landed.
    const updated: Invoice = {
      ...invoice,
      status: "paid",
      paidOn: format(new Date(), "yyyy-MM-dd"),
      updatedAt: new Date().toISOString(),
    };
    if (!save(updated)) return;
    const amount = formatCurrency(invoice.total, currency);
    toast(
      invoice.reminders.length > 0
        ? `${amount} in the bank — follow-ups stopped`
        : `${amount} in the bank — nice work`
    );
  };

  // Editing `paidOn` never touches status, amount, or anything else about
  // the invoice — it only moves which month's revenue this invoice counts
  // toward on the dashboard chart (`monthlyPaidSeries`). Validated rather
  // than clamped: a rejected edit leaves the field showing the last
  // persisted value (it's a controlled input bound to `invoice.paidOn`, not
  // local state), so there's nothing to revert.
  const handlePaidOnChange = (value: string) => {
    if (value) {
      const result = validatePaidOn(value, invoice.billDate);
      if (!result.ok) {
        toast(result.error);
        return;
      }
    }
    const updated: Invoice = {
      ...invoice,
      paidOn: value || undefined,
      updatedAt: new Date().toISOString(),
    };
    if (!save(updated)) return;
    toast(value ? "Payment date updated" : "Payment date cleared");
  };

  // Unreachable while FEATURES.followups is off — the follow-ups card below
  // (the only UI that calls this) doesn't render. Left in place so it works
  // the moment the flag flips back on.
  const handleTogglePause = () => {
    const updated: Invoice = {
      ...invoice,
      followupsPaused: !invoice.followupsPaused,
      updatedAt: new Date().toISOString(),
    };
    if (!save(updated)) return;
    toast(
      updated.followupsPaused
        ? `Follow-ups paused for ${invoice.invoiceNumber}`
        : `Follow-ups resumed for ${invoice.invoiceNumber}`
    );
  };

  // MOCK: no email is ever sent. This only records today's date on the
  // invoice's reminder history and toasts as if it had gone out.
  // Also unreachable while FEATURES.followups is off — see handleTogglePause.
  const handleSendNow = () => {
    const updated: Invoice = {
      ...invoice,
      reminders: [...invoice.reminders, format(new Date(), "yyyy-MM-dd")],
      updatedAt: new Date().toISOString(),
    };
    if (!save(updated)) return;
    toast(`"${template?.name ?? "Reminder"}" sent to ${invoice.client.companyName}`);
  };

  const handleDelete = () => {
    if (!remove(invoice.id)) return;
    setDeleteOpen(false);
    toast(`${invoice.invoiceNumber} deleted`);
    router.push("/");
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-stretch flex-1 min-h-0">
        {/* Left pane */}
        <div className="flex-[1_1_460px] min-w-0 p-6 flex flex-col gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
            >
              <ChevronLeft className="size-3.5" />
              All invoices
            </Link>
            <div className="flex items-center gap-2 mt-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] font-mono">
                {invoice.invoiceNumber}
              </h1>
              {/* effectiveStatus, not the raw stored status — the due line
                  right below already derives its "overdue" wording from
                  daysLate, and the badge must not contradict it by saying
                  "Sent" next to "N days overdue". */}
              <StatusBadge status={effectiveStatus(invoice)} />
            </div>
            <p className={cn("text-sm mt-1.5", line.destructive ? "text-destructive" : "text-muted-foreground")}>
              {line.text}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {invoice.status === "draft" && (
              <Button size="sm" onClick={handleMarkSent}>
                Mark as sent
              </Button>
            )}
            {(invoice.status === "sent" || invoice.status === "overdue") && (
              <Button size="sm" onClick={handleMarkPaid}>
                Mark as paid
              </Button>
            )}
            <PDFDownloadButton invoice={invoice} snapshot={invoice.brandSnapshot} />
            {/* Editing preserves whatever status the invoice already has
                (`InvoiceForm`'s `status` assignment) — the invoice number,
                brand snapshot and reminder history are untouched either
                way, so surfacing Edit here for every status just makes an
                already-safe transition reachable without typing the URL. */}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices/${invoice.id}/edit`}>
                {invoice.status === "draft" ? "Edit draft" : "Edit"}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>

          {showFollowups && (
            <div className="border rounded-[14px] bg-card p-5 flex flex-col gap-3.5">
              <div className="flex items-center gap-2">
                <Bell className="size-[15px] text-muted-foreground" />
                <span className="text-sm font-semibold flex-1">Follow-ups</span>
                {followupState.kind === "active" ? (
                  <Badge className="bg-accent text-foreground border-transparent">Active</Badge>
                ) : (
                  <Badge variant="outline">{followupPillLabel(followupState)}</Badge>
                )}
              </div>

              <div className="grid grid-cols-[88px_1fr] gap-y-2 gap-x-4 text-[13px] items-baseline">
                <span className="text-muted-foreground">Next send</span>
                <span>{nextSendLine(followupState, config, brandName)}</span>
                <span className="text-muted-foreground">Template</span>
                <span>{template ? `${template.name} · ${cadenceLabel(config)}` : cadenceLabel(config)}</span>
                <span className="text-muted-foreground">Subject</span>
                <span className="text-muted-foreground">
                  {template ? fillTemplate(template.subject, templateContext(invoice, brandName)) : "—"}
                </span>
              </div>

              {invoice.reminders.length > 0 && (
                <div className="border-t pt-3 flex flex-col gap-2">
                  {invoice.reminders.map((sentDate, index) => (
                    <div key={`${sentDate}-${index}`} className="flex items-center gap-2 text-[13px]">
                      <Check className="size-[13px] text-muted-foreground" />
                      <span className="text-muted-foreground flex-1">Reminder {index + 1} sent</span>
                      <span className="tabular-nums">{formatDate(sentDate)}</span>
                    </div>
                  ))}
                </div>
              )}

              {(invoice.status === "sent" || invoice.status === "overdue") && (
                <div className="border-t pt-3.5 flex gap-2 items-center flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleTogglePause}>
                    {invoice.followupsPaused ? "Resume follow-ups" : "Pause follow-ups"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSendNow}>
                    Send one now
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Stops the moment it&apos;s marked paid
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <div className="flex-[1.2_1_220px] border rounded-[14px] bg-card p-5">
              <p className="text-xs text-muted-foreground mb-2">Billed to</p>
              <p className="text-sm font-medium">{invoice.client.companyName}</p>
              {invoice.client.name && (
                <p className="text-[13px] text-muted-foreground mt-0.5">{invoice.client.name}</p>
              )}
              {invoice.client.address && (
                <p className="text-[13px] text-muted-foreground whitespace-pre-line mt-0.5">
                  {invoice.client.address}
                </p>
              )}
            </div>

            <div className="flex-[1_1_200px] border rounded-[14px] bg-card p-5">
              <p className="text-xs text-muted-foreground mb-2">From</p>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-[7px] rounded-full shrink-0"
                  style={{ backgroundColor: invoice.brandSnapshot.accentColor }}
                />
                <span className="text-sm font-medium">{invoice.brandSnapshot.name}</span>
              </div>
              <p className="text-[13px] text-muted-foreground whitespace-pre-line mt-1">
                {invoice.brandSnapshot.address}
              </p>
            </div>

            <div className="flex-[0_1_160px] border rounded-[14px] bg-card p-5">
              <p className="text-xs text-muted-foreground mb-2">Dates</p>
              <p className="text-[13px]">Billed {formatDate(invoice.billDate)}</p>
              <p className="text-[13px] mt-1">Due {formatDate(invoice.dueDate)}</p>
              {invoice.status === "paid" && (
                <div className="mt-2.5 pt-2.5 border-t space-y-1">
                  <Label className="text-xs text-muted-foreground" htmlFor="paid-on">
                    Paid on
                  </Label>
                  <Input
                    id="paid-on"
                    type="date"
                    value={invoice.paidOn ?? ""}
                    min={invoice.billDate || undefined}
                    max={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => handlePaidOnChange(e.target.value)}
                    className="text-sm h-8"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-[14px] bg-card overflow-hidden">
            <div className="flex items-center h-10 px-4 border-b text-sm font-medium">
              <span className="flex-1">Item</span>
              <span className="w-20 text-right">Tax</span>
              <span className="w-28 text-right">Amount</span>
            </div>
            {invoice.items.map((item) => (
              <div key={item.id} className="flex items-center px-4 py-3 border-b last:border-b-0 text-sm">
                <span className="flex-1">{item.description}</span>
                <span className="w-20 text-right text-muted-foreground tabular-nums">{item.tax}%</span>
                <span className="w-28 text-right tabular-nums">
                  {formatCurrency(item.amount, currency)}
                </span>
              </div>
            ))}
            <div className="p-4 bg-muted flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(invoice.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{taxLabel(invoice.items)}</span>
                <span className="tabular-nums">{formatCurrency(invoice.totalTax, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(invoice.total, currency)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="border rounded-[14px] bg-card p-5">
              <p className="text-xs text-muted-foreground mb-2">Notes</p>
              <p className="text-[13px] text-muted-foreground whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right pane: client-facing preview */}
        <div className="flex-[1_1_508px] min-w-[508px] bg-muted border-l p-6">
          <div className="mb-4">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-[13px] text-muted-foreground">What your client sees</p>
          </div>
          <InvoicePreview
            snapshot={invoice.brandSnapshot}
            client={invoice.client}
            invoiceNumber={invoice.invoiceNumber}
            billDate={invoice.billDate}
            dueDate={invoice.dueDate}
            items={invoice.items}
            currency={invoice.currency}
            notes={invoice.notes}
            isPaid={invoice.status === "paid"}
          />
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {invoice.invoiceNumber}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
