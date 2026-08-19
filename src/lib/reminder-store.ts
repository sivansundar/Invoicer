import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToInvoice, rowToTemplate, type InvoiceRow, type EmailTemplateRow } from "./supabase/mappers";
import { reminderSchedule } from "./reminder-stages";
import type { SentReminder } from "./reminder-stages";
import type { ClaimedSlot, ReminderStore, SweepCandidate } from "./reminder-run";

/**
 * The `ReminderStore` the scheduler actually runs against.
 *
 * Everything here holds the service role, so every query names its own
 * filters explicitly — there is no RLS underneath to catch a missing `org_id`.
 * That is the cost of running work with no signed-in user, and the reason the
 * decisions live in `reminder-run.ts` against an interface instead of being
 * interleaved with these queries.
 */

interface BrandRowLite {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  followup: unknown;
}

export function createReminderStore(supabase: SupabaseClient): ReminderStore {
  return {
    /**
     * Unpaid invoices past their due date, with the brand and templates each
     * needs.
     *
     * The narrowing is done here rather than in the sweep because the
     * alternative is pulling every invoice in the system across the wire to
     * discard most of them. Which *stage* is owed is still decided in
     * `dueReminder` — this only removes rows that no schedule could ever
     * select.
     *
     * `status` is the stored value, so an invoice that is merely late but
     * still marked `sent` is included; `effectiveStatus` would compute
     * `overdue` for it, and both are handled the same way downstream.
     */
    async candidates(today: Date): Promise<SweepCandidate[]> {
      const todayIso = today.toISOString().slice(0, 10);

      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("*")
        .in("status", ["sent", "overdue"])
        .eq("followups_paused", false)
        .lt("due_date", todayIso);
      if (invoiceError) throw new Error(`Reading due invoices failed: ${invoiceError.message}`);
      if (!invoiceRows?.length) return [];

      const brandIds = [...new Set(invoiceRows.map((row) => row.brand_id as string))];
      const { data: brandRows, error: brandError } = await supabase
        .from("brands")
        .select("id, org_id, name, email, followup")
        .in("id", brandIds);
      if (brandError) throw new Error(`Reading brands failed: ${brandError.message}`);

      const brands = new Map<string, BrandRowLite>(
        (brandRows ?? []).map((row) => [row.id as string, row as BrandRowLite])
      );

      // Only orgs that actually have a live sequence need their templates
      // fetched, which on a book where most brands never enable reminders is
      // most of the rows.
      const liveOrgIds = [
        ...new Set(
          [...brands.values()]
            .filter((brand) => reminderSchedule(brand.followup).enabled)
            .map((brand) => brand.org_id)
        ),
      ];
      if (liveOrgIds.length === 0) return [];

      const { data: templateRows, error: templateError } = await supabase
        .from("email_templates")
        .select("*")
        .in("org_id", liveOrgIds);
      if (templateError) throw new Error(`Reading templates failed: ${templateError.message}`);

      const templatesByOrg = new Map<string, Record<string, { id: string; subject: string; body: string }>>();
      for (const row of templateRows ?? []) {
        const template = rowToTemplate(row as EmailTemplateRow);
        const orgId = (row as { org_id: string }).org_id;
        const bucket = templatesByOrg.get(orgId) ?? {};
        bucket[template.id] = {
          id: template.id,
          subject: template.subject,
          body: template.body,
        };
        templatesByOrg.set(orgId, bucket);
      }

      const candidates: SweepCandidate[] = [];
      for (const row of invoiceRows) {
        const brand = brands.get(row.brand_id as string);
        // A brand deleted out from under its invoices leaves nothing to send
        // as, and no schedule to send on.
        if (!brand) continue;
        const schedule = reminderSchedule(brand.followup);
        if (!schedule.enabled) continue;

        candidates.push({
          orgId: brand.org_id,
          brandId: brand.id,
          brandName: brand.name,
          brandEmail: brand.email,
          invoice: rowToInvoice(row as InvoiceRow),
          schedule,
          templates: templatesByOrg.get(brand.org_id) ?? {},
        });
      }
      return candidates;
    },

    async priorSends(invoiceId: string) {
      const { data, error } = await supabase
        .from("reminder_sends")
        .select("stage, ordinal, sent_at, scheduled_for, rfc_message_id, status")
        .eq("invoice_id", invoiceId)
        // A blocked or failed attempt is not history the sequence should
        // advance past — it is a stage still owed.
        .in("status", ["sent", "recorded"])
        .order("sent_at", { ascending: true });
      if (error) throw new Error(`Reading reminder history failed: ${error.message}`);

      return (data ?? []).map((row) => ({
        stage: row.stage as SentReminder["stage"],
        ordinal: row.ordinal as number,
        sentOn: String(row.sent_at ?? row.scheduled_for ?? "").slice(0, 10),
        messageId: (row.rfc_message_id as string | null) ?? null,
      }));
    },

    /**
     * Claim the slot by inserting the row.
     *
     * A unique-violation means another run got there first, which is the
     * constraint working rather than an error — it returns null and the sweep
     * moves on. Any other error is a real failure and propagates.
     *
     * The inserted row is read back because the quota trigger may have
     * rewritten `status` to `blocked` on the way in.
     */
    async claim(args): Promise<ClaimedSlot | null> {
      const { data, error } = await supabase
        .from("reminder_sends")
        .insert({
          org_id: args.orgId,
          invoice_id: args.invoiceId,
          brand_id: args.brandId,
          stage: args.stage,
          ordinal: args.ordinal,
          template_id: args.templateId,
          to_email: args.toEmail,
          reply_to: args.replyTo,
          subject: args.subject,
          body: args.body,
          scheduled_for: args.scheduledFor,
          status: "queued",
        })
        .select("id, status, error")
        .single();

      if (error) {
        // 23505 is unique_violation.
        if (error.code === "23505") return null;
        throw new Error(`Claiming a reminder slot failed: ${error.message}`);
      }
      return {
        id: data.id as string,
        status: data.status as ClaimedSlot["status"],
        error: (data.error as string | null) ?? null,
      };
    },

    async markSent(id, providerMessageId, rfcMessageId) {
      const { error } = await supabase
        .from("reminder_sends")
        .update({
          status: "sent",
          provider_message_id: providerMessageId,
          rfc_message_id: rfcMessageId,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", id);
      if (error) throw new Error(`Recording a sent reminder failed: ${error.message}`);
    },

    async markFailed(id, detail) {
      const { error } = await supabase
        .from("reminder_sends")
        .update({ status: "failed", error: detail })
        .eq("id", id);
      if (error) throw new Error(`Recording a failed reminder failed: ${error.message}`);
    },

    async markBlocked(id, detail) {
      const { error } = await supabase
        .from("reminder_sends")
        .update({ status: "blocked", error: detail })
        .eq("id", id);
      if (error) throw new Error(`Recording a blocked reminder failed: ${error.message}`);
    },

    /**
     * TODO(bounce-webhook): nothing writes to `email_suppressions` yet. This
     * reads a table only a human can currently fill. The missing piece is an
     * endpoint verifying Resend's signature and recording `hard_bounce` and
     * `complaint` events — and on a shared sending domain it is the most
     * urgent thing left, because continuing to mail dead addresses degrades
     * delivery for every customer at once, not just the one who hit them.
     *
     * Case-insensitively, because a suppression recorded for `AP@Kestrel.com`
     * must still stop mail addressed to `ap@kestrel.com` — the local part is
     * technically case-sensitive per RFC, but no real mail system treats it
     * that way and a bounce is a bounce.
     */
    async isSuppressed(email: string) {
      const { data, error } = await supabase
        .from("email_suppressions")
        .select("email")
        .ilike("email", email)
        .maybeSingle();
      if (error) throw new Error(`Checking the suppression list failed: ${error.message}`);
      return data !== null;
    },
  };
}
