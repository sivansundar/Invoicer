"use client";

import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FollowupQueueEntry } from "@/lib/followup-queue";
import { timeLabel } from "@/lib/followups";
import type { EmailTemplate, Invoice } from "@/lib/types";

const MAX_ROWS = 6;

interface FollowupQueueProps {
  entries: FollowupQueueEntry[];
  templates: EmailTemplate[];
  onSaveInvoice: (invoice: Invoice) => Promise<Invoice>;
}

export function FollowupQueue({ entries, templates, onSaveInvoice }: FollowupQueueProps) {
  const handlePause = async (invoice: Invoice) => {
    const updated: Invoice = {
      ...invoice,
      followupsPaused: true,
      updatedAt: new Date().toISOString(),
    };
    // `onSaveInvoice` rejects when the write didn't persist. Toasting
    // "paused" regardless would tell the user it worked when the invoice's
    // queue row hasn't actually gone anywhere.
    try {
      await onSaveInvoice(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't pause follow-ups — try again");
      return;
    }
    toast(`Follow-ups paused for ${invoice.invoiceNumber}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Going out next</h2>

      <div className="border rounded-[14px] bg-card overflow-hidden">
        <div className="flex items-center h-10 px-4 bg-muted border-b text-sm font-medium">
          <div className="flex-[0_0_130px]">Invoice</div>
          <div className="flex-[1.3]">Client</div>
          <div className="flex-1">Reminder</div>
          <div className="flex-[1.3]">Scheduled</div>
          <div className="flex-[0_0_90px]" />
        </div>

        {entries.slice(0, MAX_ROWS).map((entry) => {
          const template = templates.find((t) => t.id === entry.brand.followup.templateId);
          return (
            <div
              key={entry.invoice.id}
              className="flex items-center px-4 py-3 border-b last:border-b-0 text-sm"
            >
              <div className="flex-[0_0_130px] flex items-center gap-1.5 pr-2">
                <span
                  className="size-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.brand.accentColor }}
                />
                <Link
                  href={`/invoices/${entry.invoice.id}`}
                  className="font-mono text-[13px] text-muted-foreground hover:text-foreground truncate"
                >
                  {entry.invoice.invoiceNumber}
                </Link>
              </div>
              <div className="flex-[1.3] truncate pr-2">
                {entry.invoice.client.companyName}
              </div>
              <div className="flex-1 text-[13px] text-muted-foreground truncate pr-2">
                Reminder {entry.reminderNumber} · {template?.name ?? "—"}
              </div>
              <div className="flex-[1.3] text-[13px] text-muted-foreground tabular-nums pr-2">
                {/* `entry.scheduled` is always a bare calendar day (built off
                    "yyyy-MM-ddT00:00" and only ever advanced by whole days),
                    never a real clock time — the configured send time comes
                    from the brand's own `followup.time` instead. */}
                {format(entry.scheduled, "EEE, d MMM")}, {timeLabel(entry.brand.followup.time)}
              </div>
              <div className="flex-[0_0_90px] text-right">
                <Button variant="ghost" size="sm" onClick={() => handlePause(entry.invoice)}>
                  Pause
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
