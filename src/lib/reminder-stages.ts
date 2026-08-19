/**
 * The three-stage reminder sequence, and the decision of what is owed today.
 *
 * This is the `TODO(reminder-sequence)` the phase-2 model could not support:
 * one cadence and one template meant every reminder in a chain sent identical
 * copy and only its position varied. A stage now carries its own offset from
 * the due date and its own template, so the wording escalates with the age of
 * the debt.
 *
 * Everything here is pure. The scheduler decides *whether* to send by calling
 * `dueReminder`; actually sending, recording and enforcing the quota happen
 * elsewhere, against a database. Keeping the decision separable is what makes
 * "would this invoice be chased today?" answerable in a test rather than only
 * by waiting a day and watching.
 */

import type { Invoice } from "./types";
import { isUnpaid } from "./followups";

export type ReminderStage = "nudge" | "followup" | "final";

/** In escalation order. Index in this array *is* the ordering. */
export const REMINDER_STAGES: readonly ReminderStage[] = ["nudge", "followup", "final"];

export const STAGE_LABEL: Record<ReminderStage, string> = {
  nudge: "Gentle nudge",
  followup: "Follow-up",
  final: "Final notice",
};

/**
 * Defaults chosen so the first contact is early enough to catch an invoice
 * that merely got lost, and the last is late enough that "final" is not a
 * bluff: three weeks past due is genuinely the end of a polite sequence.
 */
export const DEFAULT_STAGE_OFFSETS: Record<ReminderStage, number> = {
  nudge: 3,
  followup: 10,
  final: 21,
};

export interface StageConfig {
  stage: ReminderStage;
  enabled: boolean;
  /** Days past the invoice's due date at which this stage becomes owed. */
  offsetDays: number;
  /** Empty means unconfigured, which disables the stage — see `stageIsSendable`. */
  templateId: string;
}

export interface ReminderSchedule {
  /** The brand-level switch. Off means none of the stages fire. */
  enabled: boolean;
  stages: StageConfig[];
  /**
   * Days between repeats of the final notice once it has fired. 0 means it
   * does not repeat, which is the default: a "final" notice that arrives
   * every week for a month is not a final notice, and teaching clients that
   * the last warning is not the last warning is how a sequence stops working.
   */
  repeatFinalEveryDays: number;
}

/** A stage cannot fire without a template — there would be nothing to send. */
export function stageIsSendable(config: StageConfig): boolean {
  return config.enabled && config.templateId.trim().length > 0;
}

function clampOffset(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  // A negative offset would chase an invoice before it is due. Zero is
  // allowed and means "on the due date itself", which some people do want.
  return Math.max(0, Math.round(n));
}

/**
 * Read a schedule out of a brand's stored `followup` blob.
 *
 * Tolerant by necessity rather than by preference: every brand written before
 * this feature has the old single-cadence shape, and a brand written by a
 * client that has not reloaded may still. Rather than migrate the jsonb in
 * place — which would rewrite rows for accounts that never enable reminders —
 * unknown shapes normalise to sensible defaults on read, and are written back
 * in the new shape only when somebody edits them.
 *
 * `templateId` is carried across from the old flat config onto the *first*
 * stage only. Copying one template onto all three would recreate exactly the
 * problem this replaces: three stages that say the same thing.
 */
export function reminderSchedule(followup: unknown): ReminderSchedule {
  const raw = (followup ?? {}) as Record<string, unknown>;
  const rawStages = Array.isArray(raw.stages) ? (raw.stages as Record<string, unknown>[]) : [];
  const legacyTemplateId = typeof raw.templateId === "string" ? raw.templateId : "";

  const stages = REMINDER_STAGES.map((stage, index) => {
    const stored = rawStages.find((s) => s?.stage === stage);
    if (!stored) {
      return {
        stage,
        // A brand upgrading from the old shape gets the sequence switched on
        // only for the stage it already had copy for; the other two are off
        // until somebody chooses a template, so nobody is surprised by mail
        // they did not write.
        enabled: index === 0 && legacyTemplateId !== "",
        offsetDays: DEFAULT_STAGE_OFFSETS[stage],
        templateId: index === 0 ? legacyTemplateId : "",
      };
    }
    return {
      stage,
      enabled: stored.enabled !== false,
      offsetDays: clampOffset(stored.offsetDays, DEFAULT_STAGE_OFFSETS[stage]),
      templateId: typeof stored.templateId === "string" ? stored.templateId : "",
    };
  });

  return {
    enabled: raw.enabled === true,
    stages,
    repeatFinalEveryDays: clampOffset(raw.repeatFinalEveryDays, 0),
  };
}

/** A reminder already on the record, as far as scheduling cares. */
export interface SentReminder {
  stage: ReminderStage | "manual" | "legacy";
  ordinal: number;
  /** "yyyy-MM-dd". The day it went out. */
  sentOn: string;
}

export interface DueReminder {
  stage: ReminderStage;
  ordinal: number;
  templateId: string;
  /** "yyyy-MM-dd" the stage became owed — not necessarily today. */
  scheduledFor: string;
}

function toLocalDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * The one reminder this invoice is owed today, or null.
 *
 * At most one per call, deliberately: three emails landing in one morning
 * because a schedule was configured against an already-ancient invoice reads
 * as a malfunction, not as diligence.
 *
 * When several stages are overdue at once, the **furthest** one wins rather
 * than the earliest unsent one. An invoice sixty days late should not receive
 * "just floating this back to the top of your inbox" — the gentle nudge's
 * moment has passed, and sending it anyway would be both tonally wrong and a
 * day wasted before the stage that actually fits. Skipped stages are simply
 * never sent; no row is written for them, so the history says what happened
 * rather than what was theoretically scheduled.
 *
 * Returns null rather than throwing for every unusable input — an invoice
 * with an unparseable due date, a brand with the sequence off, a paused
 * invoice. The scheduler runs unattended across every invoice in the system,
 * so one bad row must mean "skip this one", never "abandon the run".
 */
export function dueReminder(
  invoice: Invoice,
  schedule: ReminderSchedule,
  alreadySent: SentReminder[],
  today: Date = new Date()
): DueReminder | null {
  if (!schedule.enabled) return null;
  if (invoice.followupsPaused) return null;
  // Draft invoices have not been issued and paid ones are settled; neither is
  // owed a chase, whatever the dates say.
  if (!isUnpaid(invoice)) return null;

  const due = toLocalDate(invoice.dueDate);
  if (!due) return null;

  const daysPastDue = daysBetween(due, today);
  if (daysPastDue < 0) return null;

  const sentStages = new Set(alreadySent.map((r) => r.stage));
  const furthestSentIndex = REMINDER_STAGES.reduce(
    (max, stage, index) => (sentStages.has(stage) ? index : max),
    -1
  );

  // Walk backwards: the last stage that is both configured and owed.
  for (let index = REMINDER_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = REMINDER_STAGES[index]!;
    const config = schedule.stages.find((s) => s.stage === stage);
    if (!config || !stageIsSendable(config)) continue;
    if (sentStages.has(stage)) break;
    // Never step backwards down the sequence. Reaching here with an earlier
    // index than something already sent means the data is out of order (a
    // stage enabled after a later one already fired); the sequence has moved
    // on and de-escalating would be worse than staying quiet.
    if (index < furthestSentIndex) break;
    if (daysPastDue < config.offsetDays) continue;

    return {
      stage,
      ordinal: 1,
      templateId: config.templateId,
      scheduledFor: isoDate(addDays(due, config.offsetDays)),
    };
  }

  return repeatedFinal(schedule, alreadySent, today);
}

/**
 * The final notice again, when the brand asked for it to repeat.
 *
 * Counted from the last final notice actually sent rather than from the due
 * date, so a run that was late or a period that blocked on quota does not
 * cause a burst of catch-up notices the moment it recovers.
 */
function repeatedFinal(
  schedule: ReminderSchedule,
  alreadySent: SentReminder[],
  today: Date
): DueReminder | null {
  if (schedule.repeatFinalEveryDays <= 0) return null;

  const config = schedule.stages.find((s) => s.stage === "final");
  if (!config || !stageIsSendable(config)) return null;

  const finals = alreadySent
    .filter((r) => r.stage === "final")
    .map((r) => ({ ...r, date: toLocalDate(r.sentOn) }))
    .filter((r): r is SentReminder & { date: Date } => r.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const last = finals[0];
  if (!last) return null;
  if (daysBetween(last.date, today) < schedule.repeatFinalEveryDays) return null;

  return {
    stage: "final",
    ordinal: Math.max(...finals.map((f) => f.ordinal)) + 1,
    templateId: config.templateId,
    scheduledFor: isoDate(addDays(last.date, schedule.repeatFinalEveryDays)),
  };
}

/**
 * Whether a manual chase is allowed.
 *
 * Only after the final notice has gone: before that the sequence is still
 * running and a manual send would arrive alongside an automatic one, saying
 * roughly the same thing twice. Afterwards the automation is out of moves and
 * a human deciding to push again is the whole point.
 */
export function canChaseManually(invoice: Invoice, alreadySent: SentReminder[]): boolean {
  if (!isUnpaid(invoice)) return false;
  return alreadySent.some((r) => r.stage === "final");
}

/** The ordinal a new manual chase should take. */
export function nextManualOrdinal(alreadySent: SentReminder[]): number {
  const manual = alreadySent.filter((r) => r.stage === "manual");
  return manual.length === 0 ? 1 : Math.max(...manual.map((r) => r.ordinal)) + 1;
}
