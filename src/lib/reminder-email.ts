/**
 * Composing and sending a reminder.
 *
 * Split deliberately in two. Everything above `sendReminderEmail` is pure: it
 * turns an invoice, a template and some prior history into the exact bytes of
 * a message, and can be asserted on in a test without a network. Only the last
 * function talks to Resend, over `fetch`, with no SDK — because this same code
 * has to run in a Next route handler on Node and in a Supabase Edge Function
 * on Deno, and `fetch` is the only thing both agree on.
 *
 * Nothing here reads the environment. The two hosts read their own config
 * (`process.env` / `Deno.env`) and pass it in, which is also what keeps the
 * library testable with a fake identity.
 */

import type { Invoice } from "./types";
import { fillTemplate, templateContext } from "./followups";
import type { ReminderStage } from "./reminder-stages";

/** Who mail goes out as. Supplied by the host, never read from here. */
export interface MailIdentity {
  /** The address mail is sent from — one domain this app owns. */
  fromEmail: string;
  /**
   * The domain used to anchor generated Message-IDs. Derived from `fromEmail`
   * by default; separable because the two genuinely can differ once a
   * per-customer sending domain exists.
   */
  messageIdDomain?: string;
}

export interface ReminderTemplate {
  id: string;
  subject: string;
  body: string;
}

export interface ComposeInput {
  identity: MailIdentity;
  invoice: Invoice;
  brandName: string;
  /** Where replies go — `brands.email`. Absent means this cannot be sent. */
  replyTo: string | null | undefined;
  template: ReminderTemplate;
  stage: ReminderStage | "manual";
  /**
   * The Message-IDs of earlier reminders for this same invoice, oldest first.
   * Turns four separate emails into one conversation in the client's inbox.
   */
  priorMessageIds?: string[];
  /** The id of the `reminder_sends` row, which anchors this Message-ID. */
  sendId: string;
  today?: Date;
}

export interface ComposedEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
  messageId: string;
}

/**
 * Why a reminder cannot be composed. Every one of these is a state the user
 * can fix, so they are values to be reported rather than exceptions to be
 * caught — the scheduler puts the reason on the row and moves to the next
 * invoice.
 */
export type ComposeRefusal =
  | "no_recipient"
  | "no_reply_to"
  | "empty_subject"
  | "empty_body";

export type ComposeResult =
  | { ok: true; email: ComposedEmail }
  | { ok: false; reason: ComposeRefusal; detail: string };

/**
 * An RFC 5322 display name, safe to put before an address.
 *
 * Quoted whenever the name contains anything a bare atom may not, which for a
 * brand name is nearly always — commas and full stops are common in company
 * names and both are special here. An unescaped `"` inside a quoted string
 * would end it early and let the rest of the name be read as address syntax.
 */
export function quoteDisplayName(name: string): string {
  // A run of CR/LF collapses to one space rather than one space each, so a
  // CRLF pair does not leave a double gap in the rendered name.
  const cleaned = name.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) return "";
  return `"${cleaned.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * A globally unique Message-ID, anchored to a domain this app controls.
 *
 * Built from the `reminder_sends` row id, which is already unique and already
 * the thing every other record points at — so a message in a client's inbox
 * can be traced back to exactly one row without a second identifier to keep
 * in step.
 */
export function reminderMessageId(sendId: string, domain: string): string {
  return `<reminder.${sendId}@${domain}>`;
}

function domainOf(identity: MailIdentity): string {
  if (identity.messageIdDomain) return identity.messageIdDomain;
  const at = identity.fromEmail.lastIndexOf("@");
  return at === -1 ? "invoicer.app" : identity.fromEmail.slice(at + 1);
}

/**
 * Everything needed to send one reminder, or the reason it cannot be sent.
 *
 * The subject and body are rendered here and stored by the caller, because
 * what a client received must not change when the template is next edited.
 */
export function composeReminder(input: ComposeInput): ComposeResult {
  const to = input.invoice.client?.email?.trim();
  if (!to) {
    return {
      ok: false,
      reason: "no_recipient",
      detail: "This client has no email address on file",
    };
  }

  const replyTo = input.replyTo?.trim();
  if (!replyTo) {
    // Sending anyway would put replies nowhere: the From address is shared
    // infrastructure, not a mailbox anyone reads.
    return {
      ok: false,
      reason: "no_reply_to",
      detail: "This brand has no email address, so replies would go nowhere",
    };
  }

  const context = templateContext(input.invoice, input.brandName, input.today ?? new Date());
  const subject = fillTemplate(input.template.subject, context).trim();
  const text = fillTemplate(input.template.body, context).trim();

  if (!subject) {
    return { ok: false, reason: "empty_subject", detail: "The template has no subject line" };
  }
  if (!text) {
    return { ok: false, reason: "empty_body", detail: "The template has no body" };
  }

  const domain = domainOf(input.identity);
  const messageId = reminderMessageId(input.sendId, domain);
  const prior = (input.priorMessageIds ?? []).filter((id) => id && id.trim().length > 0);

  const headers: Record<string, string> = { "Message-ID": messageId };
  if (prior.length > 0) {
    // In-Reply-To names the immediate parent; References carries the whole
    // chain. Clients that thread on one but not the other are both common,
    // so both are set rather than picking a favourite.
    headers["In-Reply-To"] = prior[prior.length - 1]!;
    headers["References"] = [...prior, messageId].join(" ");
  }

  return {
    ok: true,
    email: {
      from: `${quoteDisplayName(input.brandName)} <${input.identity.fromEmail}>`,
      to,
      replyTo,
      subject,
      text,
      headers,
      messageId,
    },
  };
}

/**
 * Why a send failed at the provider, in the only two categories that lead to
 * different behaviour.
 *
 * `permanent` means retrying sends the same message to the same dead address
 * forever — the row is failed and left alone. `transient` means the next run
 * should try again. Guessing wrong in the permanent direction loses mail
 * silently; guessing wrong in the transient direction hammers a provider that
 * has already said no, so the mapping below is deliberately conservative:
 * anything not recognisably permanent is treated as worth one more try.
 */
export type SendFailureKind = "permanent" | "transient";

export interface SendSuccess {
  ok: true;
  providerMessageId: string;
}
export interface SendFailure {
  ok: false;
  kind: SendFailureKind;
  status: number;
  detail: string;
}
export type SendResult = SendSuccess | SendFailure;

export function classifyResendStatus(status: number): SendFailureKind {
  // 429 and 5xx are the provider asking for patience.
  if (status === 429 || status >= 500) return "transient";
  // 401/403 are a misconfigured key: permanent until a human intervenes, and
  // retrying every hour until then achieves nothing but log noise.
  return "permanent";
}

export interface SendOptions {
  apiKey: string;
  email: ComposedEmail;
  /** Injectable so tests exercise this without a network. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

/**
 * Hand one composed message to Resend.
 *
 * Returns a result rather than throwing, including for network errors: the
 * caller is a loop over every overdue invoice in the system, and one
 * unreachable host must not end the run for everybody else.
 */
export async function sendReminderEmail({
  apiKey,
  email,
  fetchImpl = fetch,
  endpoint = "https://api.resend.com/emails",
}: SendOptions): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        reply_to: [email.replyTo],
        subject: email.subject,
        text: email.text,
        headers: email.headers,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      kind: "transient",
      status: 0,
      detail: err instanceof Error ? err.message : "Network error contacting Resend",
    };
  }

  if (!response.ok) {
    let detail = `Resend returned ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; name?: string };
      if (body?.message) detail = body.message;
    } catch {
      // A non-JSON error body is not itself an error worth surfacing over the
      // status code that came with it.
    }
    return {
      ok: false,
      kind: classifyResendStatus(response.status),
      status: response.status,
      detail,
    };
  }

  const body = (await response.json()) as { id?: string };
  return { ok: true, providerMessageId: body?.id ?? "" };
}
