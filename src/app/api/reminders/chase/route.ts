import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createReminderStore } from "@/lib/reminder-store";
import { composeReminder, sendReminderEmail } from "@/lib/reminder-email";
import { canChaseManually, nextManualOrdinal, reminderSchedule } from "@/lib/reminder-stages";
import { rowToInvoice, rowToTemplate, type EmailTemplateRow, type InvoiceRow } from "@/lib/supabase/mappers";

/**
 * Send one manual chase, now.
 *
 * This is what "Send one now" on the invoice screen actually does. Before
 * this route existed it appended today's date to an array and toasted as if
 * mail had gone out, which is the specific lie the whole feature was built to
 * stop telling.
 *
 * It goes through the same claim-then-send-then-record path as the scheduler,
 * against the same store, so the two cannot disagree about idempotency or
 * about the quota — the trigger fires on this insert exactly as it does on a
 * swept one. A manual chase over the monthly limit is refused with the same
 * message, from the same place.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let invoiceId: unknown;
  try {
    ({ invoiceId } = (await request.json()) as { invoiceId?: unknown });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (typeof invoiceId !== "string" || !invoiceId) {
    return NextResponse.json({ error: "Which invoice?" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email sending is not configured for this deployment" },
      { status: 503 }
    );
  }

  /**
   * Read the invoice as the *user*, not the service role. RLS is what proves
   * this invoice belongs to them; doing the lookup with the service role and
   * then checking ownership by hand would be re-implementing, less carefully,
   * the check the database already performs.
   */
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  if (!invoiceRow) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { data: brandRow, error: brandError } = await supabase
    .from("brands")
    .select("id, org_id, name, email, followup")
    .eq("id", invoiceRow.brand_id)
    .maybeSingle();
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  if (!brandRow) return NextResponse.json({ error: "This invoice has no brand" }, { status: 409 });

  const invoice = rowToInvoice(invoiceRow as InvoiceRow);
  const service = createServiceSupabase();
  const store = createReminderStore(service);
  const prior = await store.priorSends(invoice.id);

  // The same rule the UI uses to decide whether to offer the button, checked
  // again here — a disabled button is a hint, not a permission boundary.
  if (!canChaseManually(invoice, prior)) {
    return NextResponse.json(
      {
        error:
          "A manual chase is available once the final notice has gone, and only while the invoice is unpaid",
      },
      { status: 409 }
    );
  }

  const schedule = reminderSchedule(brandRow.followup);
  const finalStage = schedule.stages.find((s) => s.stage === "final");
  const templateId = finalStage?.templateId;
  if (!templateId) {
    return NextResponse.json(
      { error: "This brand has no final-notice template to send" },
      { status: 409 }
    );
  }

  const { data: templateRow } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!templateRow) {
    return NextResponse.json({ error: "That template has been deleted" }, { status: 409 });
  }
  const template = rowToTemplate(templateRow as EmailTemplateRow);

  const ordinal = nextManualOrdinal(prior);
  const today = new Date();

  // Composed before the claim, so a refusal costs no slot — same ordering,
  // and same reason, as the sweep.
  const preflight = composeReminder({
    identity: { fromEmail: process.env.REMINDER_FROM_EMAIL ?? "notifications@invoicer.app" },
    invoice,
    brandName: brandRow.name as string,
    replyTo: brandRow.email as string | null,
    template: { id: template.id, subject: template.subject, body: template.body },
    stage: "manual",
    priorMessageIds: prior.map((p) => p.messageId ?? "").filter(Boolean),
    sendId: "pending",
    today,
  });
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.detail }, { status: 409 });
  }

  const slot = await store.claim({
    orgId: brandRow.org_id as string,
    invoiceId: invoice.id,
    brandId: brandRow.id as string,
    stage: "manual",
    ordinal,
    templateId: template.id,
    toEmail: preflight.email.to,
    replyTo: preflight.email.replyTo,
    subject: preflight.email.subject,
    body: preflight.email.text,
    scheduledFor: today.toISOString().slice(0, 10),
  });
  if (!slot) {
    return NextResponse.json(
      { error: "That reminder is already being sent" },
      { status: 409 }
    );
  }
  if (slot.status === "blocked") {
    return NextResponse.json(
      { error: slot.error ?? "This workspace is over its monthly email limit" },
      { status: 429 }
    );
  }

  if (await store.isSuppressed(preflight.email.to)) {
    const detail = `${preflight.email.to} is suppressed — it hard-bounced or reported a previous message as spam`;
    await store.markBlocked(slot.id, detail);
    return NextResponse.json({ error: detail }, { status: 409 });
  }

  const composed = composeReminder({
    identity: { fromEmail: process.env.REMINDER_FROM_EMAIL ?? "notifications@invoicer.app" },
    invoice,
    brandName: brandRow.name as string,
    replyTo: brandRow.email as string | null,
    template: { id: template.id, subject: template.subject, body: template.body },
    stage: "manual",
    priorMessageIds: prior.map((p) => p.messageId ?? "").filter(Boolean),
    sendId: slot.id,
    today,
  });
  if (!composed.ok) {
    await store.markFailed(slot.id, composed.detail);
    return NextResponse.json({ error: composed.detail }, { status: 409 });
  }

  const result = await sendReminderEmail({ apiKey, email: composed.email });
  if (!result.ok) {
    await store.markFailed(slot.id, result.detail);
    return NextResponse.json({ error: result.detail }, { status: 502 });
  }

  await store.markSent(slot.id, result.providerMessageId, composed.email.messageId);
  return NextResponse.json({ ok: true, sentTo: composed.email.to });
}
