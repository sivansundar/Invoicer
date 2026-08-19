# Reminder emails — spec

Branch: `claude/reminder-emails`, forked from `v1` at `8ae3542`.

This is the feature `lib/features.ts` has been labelling `TODO(email-provider)`
and `TODO(reminder-sequence)` since phase 2. It replaces the facade: reminders
stop being a date appended to an array and become mail that actually leaves.

## Decisions taken

| Question | Answer |
|---|---|
| Sending | **Resend**, from one domain this app owns (`notifications@invoicer.app`) |
| Identity | `From` carries the brand's name; `Reply-To` carries `brands.email` |
| Scheduler | **Supabase pg_cron + Edge Function** — scheduling lives next to the data |
| Stage timing | **Days past due, per stage** — each stage has its own offset |
| Limits | Generous per-org monthly ceiling, default 2000 |

Gmail OAuth was specced first and dropped. What that swap bought and cost is
worth keeping, because the trade decides the shape of everything below.

**Bought:** no customer ever edits DNS, and no Google verification review
gates launch. Onboarding is nothing at all — a brand with an email address can
send.

**Cost:** one sending reputation, shared by every customer. Mail shows
"via invoicer.app" in Gmail. Replies only reach the customer because
`Reply-To` says so, rather than because the mail genuinely came from them.

Two things in the schema exist *only* to pay that cost, and neither is
optional:

- **A per-org monthly limit.** Not rationing a paid resource — a wall that a
  runaway loop, an import marking two thousand invoices overdue at once, or
  somebody using an editable template as a mailing list hits before the shared
  domain's reputation does.
- **A global suppression list.** A hard bounce means the mailbox does not
  exist; a complaint means a human said stop. Both are facts about the
  *recipient*, so one org's bounce suppresses that address for everyone. A
  shared domain that keeps mailing dead addresses gets throttled for all of
  its tenants at once.

## The three stages

`Gentle nudge → Follow-up → Final notice`, each firing at its own offset in
days past the invoice due date, each with its own template per brand. The
three templates seeded at signup already carry exactly these names and tones.

Rules the scheduler holds to:

- Stages fire **in order**, at most one per invoice per run.
- A stage fires **once** per invoice. Idempotency is a unique constraint on
  `(invoice, stage, ordinal)`, not an assumption that cron runs exactly once —
  which is not a property any scheduler has.
- Nothing fires for an invoice that is paid, draft, paused, or not yet past
  due; nor for a brand with no email address to route replies to.
- **Manual chase** is available once Final notice has fired, recorded as its
  own stage so "we sent four" stays true.
- Optionally, Final notice repeats every N days until the invoice is paid.

## Data

- `orgs.monthly_email_limit` — the ceiling. Usage is *counted from*
  `reminder_sends`, never incremented into a column that could drift.
- `email_suppressions` — global, no client access at all.
- `reminder_sends` — one row per attempt: rendered subject and body frozen at
  send time, Resend's message id, the Message-ID this app generated for
  threading, and the outcome. This is the source of truth; the legacy
  `invoices.reminders date[]` is backfilled from it and kept only so nothing
  already reading it breaks.

`status` distinguishes `blocked` (this app refused: suppressed address, or
over the limit) from `failed` (Resend was asked and something went wrong).
They need completely different responses from a user, so they are not one
status with a message attached.

Storing rendered copy matters: a template edited next month must not rewrite
what a client was actually sent — the same reason `brand_snapshot` is frozen
onto an invoice.

## Verified, not assumed

The migration chain was applied to a real Postgres 16 and the security claims
exercised rather than asserted:

- an org sees only its own `reminder_sends`;
- a client cannot insert one (no write policy) — so nobody can write "sent"
  for mail that never existed;
- a client cannot read `email_suppressions` at all, so one customer cannot
  enumerate addresses that bounced for another;
- claiming the same `(invoice, stage, ordinal)` twice fails on the constraint.

## Out of scope, deliberately

- **Per-customer sending domains.** The `provider` seam and the shared-domain
  choice are separable; a customer wanting their own domain's reputation is a
  later feature, and it is the one that reintroduces DNS setup.
- **Open and click tracking.** `TODO(open-tracking)` stays open.
- **Inbound reply parsing.** Replies land in the brand's own inbox, which is
  the point. Detecting "the client replied, stop chasing" needs a mailbox
  integration this deliberately does not have.
