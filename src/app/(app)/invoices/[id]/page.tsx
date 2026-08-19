"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { toast } from "sonner";
import { Bell, Check, ChevronLeft, Clock, Send, TriangleAlert, Wallet } from "lucide-react";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { IconTile, LetterTile, Panel, StatusPill } from "@/components/ui/primitives";
import { InvoiceDetailSkeleton } from "@/components/ui/page-skeletons";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { getReminderSends, sendManualChase } from "@/lib/storage";
import { SendHistory } from "@/components/followups/send-history";
import { canChaseManually, sentRemindersOf } from "@/lib/reminder-stages";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrands } from "@/hooks/use-brands";
import { useTemplates } from "@/hooks/use-templates";
import { fillTemplate, templateContext } from "@/lib/followups";
import { scheduleSummary } from "@/lib/reminder-stages";
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
  const { invoices, save, remove, loading } = useInvoices();
  const { brands } = useBrands();
  const { templates } = useTemplates();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chasing, setChasing] = useState(false);

  const id = params.id as string;
  const queryClient = useQueryClient();

  /**
   * The real send record, which is what the history below renders. The
   * invoice's own `reminders` array is a derived copy kept for older readers;
   * this table carries the outcome — including the attempts that were blocked
   * or failed, which are the ones worth showing.
   */
  const { data: sends } = useQuery({
    queryKey: queryKeys.reminderSends(id),
    queryFn: () => getReminderSends(id),
  });
  const refreshSends = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.reminderSends(id) });
  const invoice = useMemo(() => invoices.find((i) => i.id === id) ?? null, [invoices, id]);
  const brand = useMemo(() => brands.find((b) => b.id === invoice?.brandId), [brands, invoice]);

  // Before the not-found check: while the query is in flight there is no
  // invoice to find, and "Invoice not found" on a document someone just sent
  // is the most alarming thing this app could say.
  if (loading) {
    return <InvoiceDetailSkeleton />;
  }

  if (!invoice) {
    return <p className="text-sm text-muted-foreground p-6">Invoice not found.</p>;
  }

  const currency = invoice.currency ?? "INR";
  const brandName = brand?.name ?? invoice.brandSnapshot.name;
  const config = brand?.followup ?? NO_BRAND_CONFIG;
  const template = templates.find((t) => t.id === config.templateId);

  const line = dueLine(invoice, daysLate(invoice));

  // Derived once: the action card, the lifecycle rail and the pill must all
  // agree, and effectiveStatus is the only thing that reclassifies a late
  // "sent" invoice as overdue.
  const status = effectiveStatus(invoice);

  /**
   * Drafted → Sent → (Overdue) → Paid.
   *
   * "Overdue" only appears once it applies — a step that is always present
   * and usually greyed reads as something the invoice is expected to do.
   * Dates come from what is actually recorded: createdAt for drafting,
   * billDate for sending (the app has no separate sent-at), paidOn for
   * payment, which is undefined on invoices settled before that field
   * existed and renders as no date rather than a guess.
   */
  const lifecycle: Array<{ label: string; when: string | null; state: "done" | "now" | "todo" }> = [
    {
      label: "Drafted",
      when: invoice.createdAt ? formatStoredDate(invoice.createdAt.slice(0, 10), "d MMM") : null,
      state: "done",
    },
    {
      label: "Sent",
      when: invoice.status === "draft" ? null : formatStoredDate(invoice.billDate, "d MMM"),
      state: invoice.status === "draft" ? "todo" : "done",
    },
    ...(status === "overdue"
      ? [
          {
            label: "Overdue",
            when: formatStoredDate(invoice.dueDate, "d MMM"),
            state: "now" as const,
          },
        ]
      : []),
    {
      label: "Paid",
      when: invoice.paidOn ? formatStoredDate(invoice.paidOn, "d MMM") : null,
      state: invoice.status === "paid" ? ("done" as const) : ("todo" as const),
    },
  ];
  // The card's "next send" reads the same real history the scheduler does,
  // so it cannot promise a stage that has already gone.
  const followupState = resolveFollowupState(invoice, config, sentRemindersOf(sends));
  const showFollowups =
    FEATURES.followups && (invoice.status !== "draft" || invoice.reminders.length > 0);

  // `save`/`remove` (from `useInvoices`) reject when the write didn't
  // persist. Every handler below catches and bails before its own success
  // toast or any other side effect (closing a dialog, navigating away) — the
  // invoice on screen must keep showing what's actually saved, not what the
  // user just tried to save. "Mark as paid" is the sharpest case: toasting an
  // amount "in the bank" that was never actually recorded is the worst
  // version of this bug.
  const handleMarkSent = async () => {
    if (!canMarkSent(invoice)) {
      toast("Add a due date before marking this sent");
      return;
    }
    const updated: Invoice = { ...invoice, status: "sent", updatedAt: new Date().toISOString() };
    try {
      await save(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that change — try again");
      return;
    }
    toast(`${invoice.invoiceNumber} marked as sent`);
  };

  const handleMarkPaid = async () => {
    // Defaults `paidOn` to today — one click, no friction. Editable
    // afterwards from the "Paid on" field below: you mark an invoice paid
    // when you *notice*, not necessarily when the money actually landed.
    const updated: Invoice = {
      ...invoice,
      status: "paid",
      paidOn: format(new Date(), "yyyy-MM-dd"),
      updatedAt: new Date().toISOString(),
    };
    try {
      await save(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that change — try again");
      return;
    }
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
  const handlePaidOnChange = async (value: string) => {
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
    try {
      await save(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that change — try again");
      return;
    }
    toast(value ? "Payment date updated" : "Payment date cleared");
  };

  // Unreachable while FEATURES.followups is off — the follow-ups card below
  // (the only UI that calls this) doesn't render. Left in place so it works
  // the moment the flag flips back on.
  const handleTogglePause = async () => {
    const updated: Invoice = {
      ...invoice,
      followupsPaused: !invoice.followupsPaused,
      updatedAt: new Date().toISOString(),
    };
    try {
      await save(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that change — try again");
      return;
    }
    toast(
      updated.followupsPaused
        ? `Follow-ups paused for ${invoice.invoiceNumber}`
        : `Follow-ups resumed for ${invoice.invoiceNumber}`
    );
  };

  /**
   * Send a manual chase for real.
   *
   * This used to append today's date to an array and toast as though mail had
   * gone out. It now posts to `/api/reminders/chase`, which composes, claims a
   * slot, sends through Resend and records the outcome — the same path the
   * hourly sweep takes, so the two cannot disagree about idempotency or about
   * the monthly limit.
   *
   * TODO(payment-link): the mockups also offer "Copy payment link" beside this
   * action. Blocked on the payment provider, not on this.
   */
  const handleSendNow = async () => {
    setChasing(true);
    try {
      await sendManualChase(invoice.id);
    } catch (err) {
      // Every refusal from that route is a state the user can act on — over
      // the monthly limit, a suppressed address, no template — so the message
      // is surfaced verbatim rather than flattened into "try again".
      toast(err instanceof Error ? err.message : "Couldn't send that reminder");
      return;
    } finally {
      setChasing(false);
    }
    await refreshSends();
    toast(`Reminder sent to ${invoice.client.companyName}`);
  };

  const handleDelete = async () => {
    try {
      await remove(invoice.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete this invoice — try again");
      return;
    }
    setDeleteOpen(false);
    toast(`${invoice.invoiceNumber} deleted`);
    router.push("/dashboard");
  };

  return (
    <>
      <div className="flex flex-wrap items-stretch flex-1 min-h-0">
        {/* Left pane */}
        <div className="flex-[1_1_460px] min-w-0 p-8 flex flex-col gap-4">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
            >
              <ChevronLeft className="size-3.5" />
              All invoices
            </Link>
            <div className="flex items-center gap-2 mt-3">
              <h2 className="font-mono text-[22px] font-semibold tracking-[-0.02em]">
                {invoice.invoiceNumber}
              </h2>
              {/* effectiveStatus, not the raw stored status — the due line
                  right below already derives its "overdue" wording from
                  daysLate, and the badge must not contradict it by saying
                  "Sent" next to "N days overdue". */}
              <StatusPill status={status} />
            </div>
            <p className="mt-1.5 text-sm text-ink-3">
              {invoice.client.companyName} · {formatDate(invoice.billDate)}
            </p>
          </div>

          {/*
            The one thing to do, with its button on it. The secondary row below
            keeps everything else, so the primary action is not one of six
            equally-weighted buttons any more.
          */}
          <Panel className="px-5 pt-[18px] pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <IconTile
                icon={status === "overdue" ? TriangleAlert : status === "draft" ? Send : Wallet}
                tone={status === "overdue" ? "red" : status === "draft" ? "amber" : status === "paid" ? "green" : "blue"}
              />
              <span className="text-[15.5px] font-semibold tracking-[-0.012em]">
                {status === "overdue"
                  ? `Overdue by ${daysLate(invoice)} ${daysLate(invoice) === 1 ? "day" : "days"}`
                  : status === "draft"
                    ? "Not sent yet"
                    : status === "paid"
                      ? "Settled"
                      : "Awaiting payment"}
              </span>
              <span className="flex-1" />
              {invoice.status === "draft" && canMarkSent(invoice) && (
                <Button
                  onClick={handleMarkSent}
                  className="h-9 rounded-[10px] bg-ink text-canvas hover:bg-ink/90"
                >
                  Mark as sent
                </Button>
              )}
              {(invoice.status === "sent" || invoice.status === "overdue") && (
                <Button
                  onClick={handleMarkPaid}
                  className={cn(
                    "h-9 rounded-[10px]",
                    status === "overdue" && "bg-ink text-canvas hover:bg-ink/90"
                  )}
                >
                  Mark as paid
                </Button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-5">
              <div>
                <div
                  className={cn(
                    "text-[34px] leading-none font-semibold tracking-[-0.035em] tabular-nums",
                    status === "overdue" && "text-red"
                  )}
                >
                  {formatCurrency(invoice.total, currency)}
                </div>
                <div
                  className={cn(
                    "mt-2 text-[13.5px]",
                    line.destructive ? "text-red" : "text-ink-2"
                  )}
                >
                  {line.text}
                </div>
              </div>
            </div>
          </Panel>

          {/* Lifecycle: where this invoice is, and what it has already done. */}
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
            {lifecycle.map((step, index) => (
              <div key={step.label} className="flex items-center gap-3">
                {index > 0 && <span className="h-px w-5 bg-line" aria-hidden />}
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex size-[18px] items-center justify-center rounded-full",
                      step.state === "done"
                        ? "bg-green"
                        : step.state === "now"
                          ? "bg-red"
                          : "border border-line"
                    )}
                  >
                    {step.state === "done" && <Check className="size-3 text-white" strokeWidth={3} />}
                  </span>
                  <span
                    className={cn(
                      "text-[13.5px]",
                      step.state === "todo" ? "text-ink-3" : "font-medium text-ink"
                    )}
                  >
                    {step.label}
                  </span>
                  {step.when && (
                    <span className="text-[12.5px] text-ink-3 tabular-nums">{step.when}</span>
                  )}
                </span>
              </div>
            ))}
          </Panel>

          <div className="flex gap-2 flex-wrap items-center">
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
            <Panel className="flex flex-col gap-3.5 p-5">
              <div className="flex items-center gap-2.5">
                <Bell className="size-[17px] text-ink-2" />
                <span className="flex-1 text-[15.5px] font-semibold tracking-[-0.012em]">
                  Follow-ups
                </span>
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
                <span>{template ? `${template.name} · ${scheduleSummary(config)}` : scheduleSummary(config)}</span>
                <span className="text-muted-foreground">Subject</span>
                <span className="text-muted-foreground">
                  {template ? fillTemplate(template.subject, templateContext(invoice, brandName)) : "—"}
                </span>
              </div>

              <SendHistory records={sends ?? []} />

              {(invoice.status === "sent" || invoice.status === "overdue") && (
                <div className="border-t pt-3.5 flex gap-2 items-center flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleTogglePause}>
                    {invoice.followupsPaused ? "Resume follow-ups" : "Pause follow-ups"}
                  </Button>
                  {/*
                    Offered only once the final notice has gone. Before that
                    the sequence is still running and a manual send would
                    arrive alongside an automatic one saying much the same
                    thing. The route re-checks this — a hidden button is a
                    hint, not a permission boundary.
                  */}
                  {canChaseManually(
                    invoice,
                    (sends ?? []).map((r) => ({
                      stage: r.stage,
                      ordinal: r.ordinal,
                      sentOn: (r.sentAt ?? r.createdAt).slice(0, 10),
                    }))
                  ) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSendNow}
                      disabled={chasing}
                    >
                      {chasing ? "Sending…" : "Chase again"}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" asChild className="ml-auto">
                    <Link href={`/followups/brands/${invoice.brandId}`}>
                      <Clock className="size-3.5" />
                      All for this brand
                    </Link>
                  </Button>
                </div>
              )}
            </Panel>
          )}

          <div className="flex gap-4 flex-wrap">
            <Panel className="flex-[1.2_1_220px] p-5">
              <p className="mb-3 text-[12.5px] font-medium text-ink-3">Billed to</p>
              <div className="flex items-center gap-2.5">
                <LetterTile
                  letter={invoice.client.companyName.trim().slice(0, 1).toUpperCase() || "?"}
                  tone="blue"
                  size={30}
                />
                <p className="text-sm font-medium">{invoice.client.companyName}</p>
              </div>
              {invoice.client.name && (
                <p className="mt-2 text-[13px] text-ink-2">{invoice.client.name}</p>
              )}
              {invoice.client.address && (
                <p className="mt-1 text-[13px] whitespace-pre-line text-ink-2">
                  {invoice.client.address}
                </p>
              )}
            </Panel>

            <Panel className="flex-[1_1_200px] p-5">
              <p className="mb-3 text-[12.5px] font-medium text-ink-3">From</p>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-[7px] rounded-full shrink-0"
                  style={{ backgroundColor: invoice.brandSnapshot.accentColor }}
                />
                <span className="text-sm font-medium">{invoice.brandSnapshot.name}</span>
              </div>
              <p className="mt-2 text-[13px] whitespace-pre-line text-ink-2">
                {invoice.brandSnapshot.address}
              </p>
              <p className="mt-2 text-[12.5px] text-ink-3">Frozen at creation</p>
            </Panel>

            <Panel className="flex-[0_1_180px] p-5">
              <p className="mb-3 text-[12.5px] font-medium text-ink-3">Dates</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-ink-3">Billed</span>
                <span className="text-right tabular-nums">{formatDate(invoice.billDate)}</span>
                <span className="text-ink-3">Due</span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    status === "overdue" && "font-medium text-red"
                  )}
                >
                  {formatDate(invoice.dueDate)}
                </span>
                <span className="text-ink-3">Currency</span>
                <span className="text-right">{currency}</span>
              </div>
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
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </Panel>
          </div>

          <Panel className="overflow-hidden">
            <div className="flex items-center border-b px-5 py-3 text-[12.5px] font-medium text-ink-3">
              <span className="flex-1">Item</span>
              <span className="w-20 text-right">Tax</span>
              <span className="w-28 text-right">Amount</span>
            </div>
            {invoice.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center border-b px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="flex-1">{item.description}</span>
                <span className="w-20 text-right text-ink-3 tabular-nums">{item.tax}%</span>
                <span className="w-28 text-right tabular-nums">
                  {formatCurrency(item.amount, currency)}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-1.5 border-t bg-canvas p-5">
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(invoice.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">{taxLabel(invoice.items)}</span>
                <span className="tabular-nums">{formatCurrency(invoice.totalTax, currency)}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t pt-3">
                <span className="text-[15px] font-semibold">Total</span>
                <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
                  {formatCurrency(invoice.total, currency)}
                </span>
              </div>
            </div>
          </Panel>

          {invoice.notes && (
            <Panel className="p-5">
              <p className="mb-2 text-[12.5px] font-medium text-ink-3">Notes on the invoice</p>
              <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-2">
                {invoice.notes}
              </p>
            </Panel>
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
    </>
  );
}
