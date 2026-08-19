# Reminder emails — outliers and backlog

What shipped is in `00-spec.md`. This is the honest remainder: decisions that
diverge from the brief, things deliberately not built, and the parts that a
sandbox could not prove.

## Divergences from the brief

### The sweep is an app endpoint, not an Edge Function

pg_cron owns the schedule as chosen, but it calls `/api/reminders/run` rather
than a Deno function. The sequencing rules, template rendering and error
classification are tested TypeScript a Deno function cannot import — different
module resolution, and this codebase's `@/` aliases and extension-less imports
do not survive the trip. The alternative was a second implementation of
`dueReminder` in Deno.

Two answers to "which reminder is owed today" would be right the day they were
written and disagree quietly a month later. **Cost:** the sweep needs the app
up. Bounded, because what is owed derives from dates and history rather than a
queue that drains — an hour of downtime delays reminders, it does not lose
them.

### Gmail OAuth was specced, built partway, and thrown away

The first design sent through each user's own mailbox. It was replaced by
Resend on a shared domain mid-build. Nothing was committed, so no dead code
remains — but the trade is worth recording, because it is reversible:

| | Gmail OAuth | Resend, shared domain |
|---|---|---|
| Customer setup | One click | None |
| Your gate | Google verification review | Verify one domain, once |
| Replies | Land in their inbox natively | Only because `Reply-To` says so |
| Reputation | Theirs, and Gmail's | One pool, shared by every customer |

The shared pool is why `orgs`-level limits and a global suppression list are
not optional here. They would have been optional on Gmail.

### The plan moved to Postgres, which was not asked for

`usePlan` read `localStorage` while the quota trigger read `org_billing` —
a split introduced by the quota work itself. A tier a browser can write is a
tier every browser can grant itself, and that stopped being cosmetic the
moment the email allowance depended on it. Fixing it meant a route, a hook
rewrite, and deleting tests for behaviour that no longer exists.

### The weekly cadence was deleted, not kept alongside

`nextSendDate`, `cadenceLabel`, `timeLabel` and `DAYS` are gone, along with
~40 assertions covering them. Keeping them would have left two schedulers: the
stage walk deciding what actually sends, and a cadence calculation still
driving the queue preview, the brands list and the invoice card. A screen
promising Tuesday for a reminder the scheduler sends on Wednesday is invisibly
wrong until a user notices it was always wrong.

**Consequence worth knowing:** a brand carried over from the old model has
only its *first* stage configured. Once that has sent, nothing more is queued
until somebody picks templates for stages two and three. Silence is correct —
the alternative is sending copy nobody wrote — but it is a behaviour change
for existing accounts, and it is pinned by a test.

## Not built, deliberately

| Thing | Why not |
|---|---|
| Per-customer sending domains | Reintroduces the DNS setup the shared domain exists to avoid. The `provider` check constraint leaves room. |
| Open and click tracking | `TODO(open-tracking)`. Needs a decision about injecting pixels into customers' mail, not just code. |
| Inbound reply parsing | "The client replied, stop chasing" needs a mailbox integration. Replies reach the brand's inbox; the app never sees them. |
| Outlook / Microsoft Graph | Moot under Resend. |
| A bounce webhook | **The real gap.** `email_suppressions` is read on every send but nothing writes to it yet — see below. |

## Backlog, in the order it matters

1. **`TODO(bounce-webhook)` — nothing populates `email_suppressions`.**
   The table exists, the scheduler and the chase route both consult it, and
   the schema is right. What is missing is a `/api/reminders/webhook` endpoint
   verifying Resend's signature and writing `hard_bounce` and `complaint`
   rows. Until it exists, suppression only ever contains hand-entered rows,
   and a shared sending domain that keeps mailing dead addresses is the single
   fastest way to damage delivery **for every customer at once**. This should
   land before real sending is switched on.
2. **`TODO(payment-provider)`** — `/api/billing/tier` sets a tier from a
   request this app merely trusts. A provider webhook must become the writer,
   and this route become "start a checkout". `renews_on` is fabricated a month
   out.
3. **`TODO(drop-legacy-cadence)`** — `FollowupConfig` still carries `mode`,
   `weekday`, `time`, `repeat` and `stopAfter` as required fields nothing
   schedules from. Removing them needs a migration rewriting `followup` jsonb;
   deferred so this feature did not also become a data migration.
4. **`TODO(reminder-sequence)` in `types.ts` is now done** — the named
   three-stage sequence exists. The marker stays only where genuinely open.
5. **Per-brand quota visibility.** The sidebar shows the org's allowance. A
   workspace with several brands cannot see which one is consuming it.
6. **Retry policy for `failed` sends.** A transient failure is recorded and
   never retried — the next run finds the slot claimed. Retrying means moving
   `failed` rows back to `queued` on a bounded schedule, which is deliberate
   work rather than a missing line.

## Verified, and not

**Verified against a real Postgres 16** (13 migrations, platform objects
stubbed): tenancy isolation on `reminder_sends`; a client cannot forge a send
record; a client cannot read the suppression list at all; a duplicate
`(invoice, stage, ordinal)` claim fails; a 3-email ceiling queues 3 and blocks
2 with the reason attached; raising the limit lets blocked rows retry in place;
an org with no billing row is refused rather than sent unlimited mail; the
private quota implementation is unreachable from a client.

**Mutation-checked**, so the tests are known to be load-bearing: the
furthest-owed-stage walk, the de-escalation guard, claim-before-send, and
reading the claim status back rather than assuming it.

**Not verified here, and needing a real deployment:**

- `create extension pg_cron` / `pg_net` — neither is available in this
  sandbox. Everything downstream of them was exercised with stubs.
- Any actual delivery. No message has been sent through Resend. The composed
  bytes are asserted; the provider's acceptance of them is not.
- Every screen in this feature. Supabase local cannot start here, so the stage
  editor, the send history and the quota meter are covered by types, lint,
  build and unit tests — not by anyone looking at them.
