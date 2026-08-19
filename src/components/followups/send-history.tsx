"use client";

import { AlertTriangle, Ban, Check, Clock, FileClock } from "lucide-react";
import { STAGE_LABEL } from "@/lib/reminder-stages";
import { formatStoredDate } from "@/lib/dates";
import type { ReminderSendRecord } from "@/lib/storage";

/**
 * Every reminder attempted for one invoice, including the ones that did not
 * go.
 *
 * Showing only successes would answer "what went out" while hiding "why
 * nothing did" — and the second question is the one somebody has when they
 * are looking at an unpaid invoice wondering why the client has not heard
 * from them. A blocked or failed row with its reason attached is the whole
 * point of storing those rows.
 */

const STATUS_META: Record<
  ReminderSendRecord["status"],
  { icon: typeof Check; tone: string; label: string }
> = {
  sent: { icon: Check, tone: "text-green", label: "Sent" },
  queued: { icon: Clock, tone: "text-blue", label: "Sending" },
  failed: { icon: AlertTriangle, tone: "text-red", label: "Failed" },
  blocked: { icon: Ban, tone: "text-amber", label: "Not sent" },
  /**
   * Recorded before this app could send anything: a date somebody logged
   * against the invoice under the old model. Labelled distinctly so "we have
   * chased them three times" never silently counts an email that never
   * existed.
   */
  recorded: { icon: FileClock, tone: "text-ink-3", label: "Logged only" },
};

function stageName(record: ReminderSendRecord): string {
  if (record.stage === "manual") {
    return record.ordinal > 1 ? `Manual chase ${record.ordinal}` : "Manual chase";
  }
  if (record.stage === "legacy") return "Reminder";
  const label = STAGE_LABEL[record.stage];
  return record.ordinal > 1 ? `${label} ${record.ordinal}` : label;
}

export function SendHistory({ records }: { records: ReminderSendRecord[] }) {
  if (records.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      {records.map((record) => {
        const meta = STATUS_META[record.status];
        const Icon = meta.icon;
        const when = record.sentAt ?? record.scheduledFor ?? record.createdAt;

        return (
          <div key={record.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-[13px]">
              <Icon className={`size-[13px] shrink-0 ${meta.tone}`} />
              <span className="flex-1 truncate">{stageName(record)}</span>
              <span className="shrink-0 text-ink-3">{meta.label}</span>
              <span className="shrink-0 tabular-nums text-ink-2">
                {formatStoredDate(when.slice(0, 10), "d MMM", "—")}
              </span>
            </div>
            {record.error && (
              // The reason, verbatim, rather than a generic "something went
              // wrong". Every one of these is a state the user can act on:
              // over quota, suppressed address, template deleted.
              <p className="pl-[21px] text-[12.5px] text-ink-3">{record.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
