/**
 * One pass of the reminder scheduler.
 *
 * The interesting part of a scheduler is not the timer, it is the ordering:
 * claim the slot, then compose, then send, then record. Getting that sequence
 * wrong sends a client the same chase twice, which is the single worst thing
 * this feature can do. So the ordering lives here, behind an injected store,
 * and is asserted against a fake — including the paths a real database makes
 * awkward to reach on purpose, like two runs racing for the same slot.
 *
 * Every effect the sweep needs is a method on `ReminderStore`. Nothing in
 * this file knows about Postgres, HTTP, or which host it is running on.
 */

import type { Invoice } from "./types";
import {
  dueReminder,
  type ReminderSchedule,
  type ReminderStage,
  type SentReminder,
} from "./reminder-stages";
import {
  composeReminder,
  sendReminderEmail,
  type MailIdentity,
  type ReminderTemplate,
  type SendResult,
} from "./reminder-email";

/** Everything the sweep needs to know about one invoice worth considering. */
export interface SweepCandidate {
  orgId: string;
  brandId: string;
  brandName: string;
  /** `brands.email` — where replies go. Null means this brand cannot send. */
  brandEmail: string | null;
  invoice: Invoice;
  schedule: ReminderSchedule;
  /** The brand's templates, by id. A stage naming a missing one is skipped. */
  templates: Record<string, ReminderTemplate>;
}

/** A slot successfully claimed — the row exists and is ours to complete. */
export interface ClaimedSlot {
  id: string;
  /**
   * The status the row landed in. The quota trigger can rewrite a claim to
   * `blocked` on the way in, so this is read back rather than assumed: acting
   * on the status we asked for instead of the one we got is how a limit gets
   * bypassed by the code that respects it.
   */
  status: "queued" | "blocked";
  error: string | null;
}

export interface ReminderStore {
  /**
   * Unpaid, past-due invoices whose brand has the sequence switched on.
   * Narrowing happens in the database; which *stage* is owed is decided here.
   */
  candidates(today: Date): Promise<SweepCandidate[]>;
  /** Every reminder already on the record for an invoice, oldest first. */
  priorSends(invoiceId: string): Promise<(SentReminder & { messageId: string | null })[]>;
  /** Insert the row, or null when another run already holds the slot. */
  claim(args: {
    orgId: string;
    invoiceId: string;
    brandId: string;
    stage: ReminderStage | "manual";
    ordinal: number;
    templateId: string;
    toEmail: string;
    replyTo: string;
    subject: string;
    body: string;
    scheduledFor: string;
  }): Promise<ClaimedSlot | null>;
  markSent(id: string, providerMessageId: string, rfcMessageId: string): Promise<void>;
  markFailed(id: string, detail: string): Promise<void>;
  markBlocked(id: string, detail: string): Promise<void>;
  isSuppressed(email: string): Promise<boolean>;
}

export interface SweepReport {
  considered: number;
  sent: number;
  /** Refused before contacting Resend: suppressed address, or over quota. */
  blocked: number;
  failed: number;
  /** Nothing was owed, or the stage could not be composed. */
  skipped: number;
  reasons: Record<string, number>;
}

export interface SweepDeps {
  store: ReminderStore;
  identity: MailIdentity;
  apiKey: string;
  today?: Date;
  fetchImpl?: typeof fetch;
  /**
   * A ceiling on messages per run, independent of any org's monthly quota.
   * Protects the provider's rate limit and bounds how wrong a single bad run
   * can go before somebody notices.
   */
  maxPerRun?: number;
}

function count(reasons: Record<string, number>, key: string): void {
  reasons[key] = (reasons[key] ?? 0) + 1;
}

/**
 * Run the sweep once.
 *
 * Never throws for a single bad invoice. The loop is over every overdue
 * invoice in the system, so one malformed row, one refused compose or one
 * unreachable provider must mean "skip this one", never "abandon everybody
 * else's reminders for the day".
 */
export async function runReminderSweep(deps: SweepDeps): Promise<SweepReport> {
  const today = deps.today ?? new Date();
  const maxPerRun = deps.maxPerRun ?? 200;
  const report: SweepReport = {
    considered: 0,
    sent: 0,
    blocked: 0,
    failed: 0,
    skipped: 0,
    reasons: {},
  };

  const candidates = await deps.store.candidates(today);

  for (const candidate of candidates) {
    if (report.sent + report.failed >= maxPerRun) {
      count(report.reasons, "run_limit_reached");
      break;
    }
    report.considered += 1;

    const prior = await deps.store.priorSends(candidate.invoice.id);
    const due = dueReminder(candidate.invoice, candidate.schedule, prior, today);
    if (!due) {
      report.skipped += 1;
      continue;
    }

    const template = candidate.templates[due.templateId];
    if (!template) {
      // A stage pointing at a deleted template. Skipped rather than failed:
      // nothing was attempted, and the fix is to pick a template, not to
      // retry.
      report.skipped += 1;
      count(report.reasons, "template_missing");
      continue;
    }

    // Composed before the claim so a refusal costs no slot — a brand with no
    // reply-to would otherwise burn its nudge slot on every run, and the
    // stage could never be sent once the address was added.
    const composed = composeReminder({
      identity: deps.identity,
      invoice: candidate.invoice,
      brandName: candidate.brandName,
      replyTo: candidate.brandEmail,
      template,
      stage: due.stage,
      priorMessageIds: prior.map((p) => p.messageId ?? "").filter(Boolean),
      // The Message-ID must match the row that ends up holding it, so the id
      // is stitched in after the claim. This placeholder never leaves here.
      sendId: "pending",
      today,
    });
    if (!composed.ok) {
      report.skipped += 1;
      count(report.reasons, composed.reason);
      continue;
    }

    const slot = await deps.store.claim({
      orgId: candidate.orgId,
      invoiceId: candidate.invoice.id,
      brandId: candidate.brandId,
      stage: due.stage,
      ordinal: due.ordinal,
      templateId: template.id,
      toEmail: composed.email.to,
      replyTo: composed.email.replyTo,
      subject: composed.email.subject,
      body: composed.email.text,
      scheduledFor: due.scheduledFor,
    });

    if (!slot) {
      // Another run holds it. Not an error — it is the constraint doing
      // exactly its job.
      report.skipped += 1;
      count(report.reasons, "already_claimed");
      continue;
    }

    // The quota trigger may have rewritten the claim on the way in.
    if (slot.status === "blocked") {
      report.blocked += 1;
      count(report.reasons, "over_quota");
      continue;
    }

    // Suppression is checked after the claim so the refusal is recorded
    // against the invoice, where the user will look, rather than vanishing.
    if (await deps.store.isSuppressed(composed.email.to)) {
      await deps.store.markBlocked(
        slot.id,
        `${composed.email.to} is suppressed — it hard-bounced or reported a previous message as spam`
      );
      report.blocked += 1;
      count(report.reasons, "suppressed");
      continue;
    }

    const withRealId = composeReminder({
      identity: deps.identity,
      invoice: candidate.invoice,
      brandName: candidate.brandName,
      replyTo: candidate.brandEmail,
      template,
      stage: due.stage,
      priorMessageIds: prior.map((p) => p.messageId ?? "").filter(Boolean),
      sendId: slot.id,
      today,
    });
    if (!withRealId.ok) {
      // Unreachable in practice: the same inputs composed a moment ago.
      // Handled rather than asserted because "cannot happen" in a loop that
      // runs unattended every hour eventually does.
      await deps.store.markFailed(slot.id, withRealId.detail);
      report.failed += 1;
      continue;
    }

    const result: SendResult = await sendReminderEmail({
      apiKey: deps.apiKey,
      email: withRealId.email,
      fetchImpl: deps.fetchImpl,
    });

    if (result.ok) {
      await deps.store.markSent(
        slot.id,
        result.providerMessageId,
        withRealId.email.messageId
      );
      report.sent += 1;
      continue;
    }

    await deps.store.markFailed(slot.id, result.detail);
    report.failed += 1;
    count(report.reasons, `send_${result.kind}`);
  }

  return report;
}
