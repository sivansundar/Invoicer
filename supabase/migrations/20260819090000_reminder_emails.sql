/**
 * Reminder emails: a real record of what was sent, and the guardrails a
 * shared sending domain requires.
 *
 * Until now `invoices.reminders` was a `date[]` and nothing ever left the
 * building — "sent" meant "a date was appended". This migration adds the
 * tables that make sending real, and demotes that array to a derived copy.
 *
 * Mail goes out through Resend from one domain this app owns, with the
 * brand's own address as Reply-To. That choice removes all per-customer DNS
 * setup, and in exchange makes every customer share one sending reputation.
 * Two things here exist only because of that trade: a per-org send limit and
 * a suppression list. Neither is optional on a shared domain — one customer
 * mailing dead addresses, or using an editable template as a mailing list,
 * degrades delivery for everybody else on it.
 */

-- ---------------------------------------------------------------------------
-- Where replies go
-- ---------------------------------------------------------------------------

/**
 * `brands.email`, with no new column.
 *
 * `From` is always the app's own domain — that is what removes per-customer
 * DNS setup — but it carries the brand's name, and `Reply-To` carries
 * `brands.email`, so a client hitting reply reaches the person who invoiced
 * them rather than this application.
 *
 * A dedicated `reminder_reply_to` column was written and then removed. It
 * only ever held a copy of `brands.email`, backfilled once at migration time,
 * which meant every brand created *after* this migration would have been null
 * and would silently have sent nothing. Guaranteeing otherwise needs a trigger
 * maintaining an invariant whose whole content is "equals the other column".
 * A brand wanting replies at a different address than the one on its invoices
 * is a real but hypothetical want; it can have a column the day somebody asks.
 *
 * A brand with no email therefore sends no reminders. That is intended: chase
 * mail a client cannot reply to is worse than none, because it invites a reply
 * into a void at exactly the moment somebody wants to explain when they pay.
 *
 * The monthly allowance is not here either — it belongs to the plan, and
 * lives in `20260819091000_billing_plans.sql` with the trigger that enforces
 * it on every row entering the `queued` state.
 */

-- ---------------------------------------------------------------------------
-- Suppression
-- ---------------------------------------------------------------------------

/**
 * Addresses that must never be mailed again.
 *
 * Global rather than per-org, and that is the deliberate part. A hard bounce
 * means the mailbox does not exist; a complaint means a human said stop. Both
 * are properties of the recipient, not of whichever org happened to trigger
 * them, and on a shared sending domain the cost of ignoring them is paid by
 * every other customer. So one org's bounce suppresses that address for all.
 *
 * `source` separates a provider webhook from a hand-entered row, because
 * un-suppressing after a corrected typo is legitimate and wants a trail.
 */
create table public.email_suppressions (
  email              text primary key,
  reason             text not null
                       check (reason in ('hard_bounce', 'complaint', 'manual')),
  source             text not null default 'webhook'
                       check (source in ('webhook', 'manual')),
  -- Kept for support: whose send surfaced this, without implying the
  -- suppression belongs to them.
  first_seen_org_id  uuid references public.orgs(id) on delete set null,
  detail             text,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- What was actually sent
-- ---------------------------------------------------------------------------

/**
 * One row per reminder, holding what was sent rather than what a template
 * says today.
 *
 * `subject` and `body` are the rendered copy, frozen at send time. A template
 * edited next month must not rewrite the record of what a client received —
 * the same reasoning that freezes `brand_snapshot` onto an invoice.
 *
 * The row is written as `queued` *before* the Resend call and updated after.
 * That ordering is the idempotency mechanism: the unique constraint below
 * means a second concurrent run — a cron that fires twice, or a retry after a
 * timeout that actually succeeded — cannot claim the same slot, so it cannot
 * send the same reminder twice. Correctness does not depend on the scheduler
 * running exactly once, which is not a property any scheduler has.
 */
create table public.reminder_sends (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  brand_id             uuid not null references public.brands(id) on delete cascade,
  /**
   * `legacy` is the pre-email history migrated out of `invoices.reminders`:
   * a date somebody recorded when nothing could send. Kept distinct from the
   * real stages so "we have chased them three times" never counts a reminder
   * that was never transmitted.
   */
  stage                text not null
                         check (stage in ('nudge', 'followup', 'final', 'manual', 'legacy')),
  -- 1 for each of the three automatic stages. Increments for repeated final
  -- notices and for each manual chase, so those can recur while the unique
  -- constraint still pins one row per (invoice, stage, occurrence).
  ordinal              int not null default 1 check (ordinal >= 1),
  template_id          uuid references public.email_templates(id) on delete set null,
  to_email             text not null,
  reply_to             text,
  subject              text not null,
  body                 text not null,
  /**
   * `blocked` is a send this app refused before contacting Resend — the
   * address is suppressed, or the org is over its monthly limit. Kept
   * separate from `failed`, which means Resend was asked and something went
   * wrong, because the two need completely different responses from a user.
   */
  status               text not null default 'queued'
                         check (status in ('queued', 'sent', 'failed', 'blocked', 'recorded')),
  -- Resend's own id, for support lookups against their logs.
  provider_message_id  text,
  /**
   * The RFC 5322 Message-ID this app generates for the outgoing mail.
   * Resend has no notion of threads, so threading is done the way email
   * itself does it: later stages carry the earlier ids in
   * In-Reply-To/References, and a client sees one conversation rather than
   * four unrelated messages.
   */
  rfc_message_id       text,
  error                text,
  -- The due-date-derived day this send was owed. Kept so a late cron run
  -- reports when the reminder was due, not merely when it got out.
  scheduled_for        date,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),

  constraint reminder_sends_slot_unique unique (invoice_id, stage, ordinal)
);
create index reminder_sends_org_id_idx on public.reminder_sends (org_id);
create index reminder_sends_invoice_id_idx on public.reminder_sends (invoice_id);
create index reminder_sends_brand_id_idx on public.reminder_sends (brand_id);
-- Counting an org's usage for the month runs on every send, so it must not
-- scan the whole table.
create index reminder_sends_org_sent_at_idx on public.reminder_sends (org_id, sent_at)
  where status = 'sent';
-- The scheduler's sweep for rows a crashed run left in flight.
create index reminder_sends_queued_idx on public.reminder_sends (status, created_at)
  where status = 'queued';

/**
 * Carry the pre-email history across.
 *
 * These land as `stage = 'legacy'`, `status = 'recorded'` with empty copy,
 * because empty copy is the truth: no subject and no body were ever composed
 * for them, and inventing some would put words in the user's mouth. The
 * ordinal follows the array order so the sequence survives.
 */
insert into public.reminder_sends
  (org_id, invoice_id, brand_id, stage, ordinal, to_email, subject, body, status, scheduled_for, sent_at)
select
  i.org_id,
  i.id,
  i.brand_id,
  'legacy',
  r.ord::int,
  coalesce(i.client_snapshot->>'email', ''),
  '',
  '',
  'recorded',
  r.sent_on,
  r.sent_on::timestamptz
from public.invoices i
cross join lateral unnest(i.reminders) with ordinality as r(sent_on, ord);

comment on column public.invoices.reminders is
  'Derived. reminder_sends is the source of truth; this array is maintained '
  'for readers that predate it and may be dropped once none remain.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.reminder_sends enable row level security;
alter table public.reminder_sends force row level security;

create policy reminder_sends_select on public.reminder_sends
  for select to authenticated
  using ((select private.is_org_member(org_id)));

/**
 * Read-only to clients, with no insert, update or delete policy at all. Every
 * write belongs to the scheduler or the manual-chase route, both of which run
 * server-side and actually talk to Resend. A client able to insert here could
 * write "sent" for mail that never existed — precisely the lie this table was
 * added to stop telling.
 */

alter table public.email_suppressions enable row level security;
alter table public.email_suppressions force row level security;

/**
 * No policies whatsoever. The suppression list is global, so exposing it to
 * any authenticated user would let one customer enumerate addresses that
 * bounced for another. The scheduler consults it with the service role; the
 * UI reports suppression through the `blocked` status on the org's own
 * `reminder_sends` rows, which reveals only addresses that org itself mailed.
 */

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- New `public` tables carry no role grants under `auto_expose_new_tables =
-- false`, and service_role's BYPASSRLS is not a substitute for privileges.
grant all on public.reminder_sends, public.email_suppressions to service_role;

grant select on public.reminder_sends to authenticated;
