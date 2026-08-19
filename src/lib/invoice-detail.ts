import { format } from "date-fns";
import type { FollowupConfig, Invoice } from "./types";
import {
  nextScheduledReminder,
  reminderSchedule,
  STAGE_LABEL,
  type ReminderStage,
  type SentReminder,
} from "./reminder-stages";

export interface DueLine {
  text: string;
  destructive: boolean;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The status-dependent line rendered under the invoice number/status badge
 * on the detail screen. `daysLateCount` is threaded in from
 * `daysLate` (`@/lib/dashboard`) rather than recomputed here, so the detail
 * page and the dashboard's overdue card can never disagree about how "late"
 * is counted.
 *
 * A `sent` invoice with no due date at all (only reachable if a draft with an
 * unset due date is marked sent directly from the detail screen — the
 * create/edit form requires a due date for anything other than a draft) gets
 * its own defensive copy rather than silently reading as "Past due", which
 * `Math.round(NaN)` would otherwise produce. A `dueDate` that is present but
 * fails to parse (e.g. corrupted storage) hits the same `NaN` and gets its
 * own honest "unreadable" copy rather than the plausible-but-false "Past due".
 *
 * The overdue branch below checks `daysLateCount > 0` on a `sent` invoice,
 * not `invoice.status === "overdue"` alone — nothing this app writes ever
 * stores that status (see `dashboard.ts`'s `effectiveStatus`), so a
 * status-only check left every genuinely late invoice falling through to the
 * "sent" branch's grey, count-less "Past due" below instead of this
 * destructive line. A literal stored "overdue" (import/hand-edited data)
 * still takes this branch regardless of `daysLateCount`.
 */
export function dueLine(
  invoice: Invoice,
  daysLateCount: number,
  today: Date = new Date()
): DueLine {
  if (invoice.status === "paid") {
    return { text: "Paid and settled — nothing to chase", destructive: false };
  }
  if (invoice.status === "draft") {
    return { text: "Draft — not sent to the client yet", destructive: false };
  }
  if (invoice.status === "overdue" || (invoice.status === "sent" && daysLateCount > 0)) {
    return {
      text: `${plural(daysLateCount, "day")} overdue — a friendly nudge might help`,
      destructive: true,
    };
  }

  // sent
  if (!invoice.dueDate) {
    return { text: "Due date not set", destructive: false };
  }
  const midnight = new Date(today.toDateString());
  const due = new Date(`${invoice.dueDate}T00:00`);
  const diffDays = Math.round((due.getTime() - midnight.getTime()) / 864e5);
  if (Number.isNaN(diffDays)) {
    return { text: "Due date unreadable", destructive: false };
  }
  if (diffDays > 0) {
    return { text: `Due in ${plural(diffDays, "day")}`, destructive: false };
  }
  return { text: "Past due", destructive: false };
}

/**
 * Whether an invoice's due date is set well enough to transition to "sent".
 * A draft is allowed to have no due date (the create/edit form only requires
 * one for a non-draft), but nothing downstream computed from a due date is —
 * `dueLine`'s "sent" branch and the whole follow-ups schedule both anchor on
 * it. `handleMarkSent` on the detail page consults this before writing the
 * transition, rather than writing a "sent" invoice that can't compute either.
 */
export function canMarkSent(invoice: Invoice): boolean {
  return Boolean(invoice.dueDate);
}

export type FollowupStateKind = "active" | "paid" | "draft" | "paused" | "limit" | "off";

export interface FollowupState {
  kind: FollowupStateKind;
  date: Date | null;
  /** Which stage is next. Only set when `kind` is "active". */
  stage?: ReminderStage;
}

/**
 * Resolves *why* follow-ups are or aren't scheduled, in the priority order
 * the handoff specifies for messaging — deliberately not the same order the
 * stage walk short-circuits internally. The walk only needs to know IF it
 * should schedule; a human reading the follow-ups card needs to know
 * WHICH of several possibly-simultaneous reasons is the relevant one (e.g. an
 * invoice can be both paid AND have its brand's follow-ups disabled — "paid"
 * is the reason worth surfacing).
 */
export function resolveFollowupState(
  invoice: Invoice,
  config: FollowupConfig,
  /**
   * What has actually been sent, from `reminder_sends`. Named stages rather
   * than the bare dates in `invoice.reminders`, because reading a stage from
   * a date's position in that array is wrong exactly when the scheduler
   * skipped ahead — the case where this card most needs to be right.
   */
  prior: SentReminder[] = [],
  today: Date = new Date()
): FollowupState {
  const next = nextScheduledReminder(invoice, reminderSchedule(config), prior, today);
  if (next) return { kind: "active", date: new Date(`${next.scheduledFor}T00:00`), stage: next.stage };

  if (invoice.status === "paid") return { kind: "paid", date: null };
  if (invoice.status === "draft") return { kind: "draft", date: null };
  if (invoice.followupsPaused) return { kind: "paused", date: null };
  // Every stage has either fired or has no template. "Over to you now" is the
  // honest reading either way, and it is what makes the manual chase button
  // the obvious next move.
  if (prior.length > 0) return { kind: "limit", date: null };
  return { kind: "off", date: null };
}

/**
 * The "Next send" grid value. `state.kind === "draft"` is unreachable through
 * the app's own flows (the follow-ups card only renders for a draft if it
 * somehow already has reminders, and reminders can only be recorded while
 * sent/overdue) but is still resolved defensively rather than left to throw.
 */
export function nextSendLine(state: FollowupState, config: FollowupConfig, brandName: string): string {
  switch (state.kind) {
    case "active":
      // No time of day any more: a stage fires on a date, and the hourly
      // sweep decides the hour. Promising "at 9:00 AM" would be a precision
      // the scheduler never offered.
      return `${STAGE_LABEL[state.stage ?? "nudge"]} on ${format(state.date as Date, "EEE, d MMM")}`;
    case "paid":
      return "Stopped — this invoice is paid";
    case "draft":
      return "Starts once the invoice is sent";
    case "paused":
      return "Paused for this invoice";
    case "limit":
      return "The sequence is finished — over to you now";
    case "off":
      return `Follow-ups are off for ${brandName}`;
  }
}

const PILL_LABEL: Record<Exclude<FollowupStateKind, "active">, string> = {
  paid: "Stopped · paid",
  // Unreachable today — the card only renders for a draft that already has
  // reminders, and reminders can only be recorded while sent/overdue. Not
  // brief text (the brief's four-pill list doesn't cover this kind); revisit
  // if a future task allows reverting a sent invoice back to draft.
  draft: "Not started",
  paused: "Paused",
  limit: "Limit reached",
  off: "Off for this brand",
};

/** Null for the "active" state — the caller renders the distinct "Active" pill instead. */
export function followupPillLabel(state: FollowupState): string | null {
  if (state.kind === "active") return null;
  return PILL_LABEL[state.kind];
}
