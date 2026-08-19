# Testing the reminder flow

Written to be followed top to bottom. Each step says what to expect, so a
wrong result is recognisable rather than merely disappointing.

## 0. Before anything sends

### Resend

The fastest path to a *real* delivered email needs no DNS at all: Resend lets
you send from `onboarding@resend.dev` to **your own account address** without
verifying a domain. Use that first — it proves the whole pipeline end to end
with nothing to set up.

```
RESEND_API_KEY=re_...
REMINDER_FROM_EMAIL=onboarding@resend.dev
```

Verify `invoicer.app` (DKIM, SPF, DMARC) only when you want to send to
addresses other than your own, and switch `REMINDER_FROM_EMAIL` then. Nothing
in the code changes.

### Environment

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # new — the sweep reads across orgs
RESEND_API_KEY=re_...                  # new
REMINDER_FROM_EMAIL=onboarding@resend.dev
REMINDER_CRON_SECRET=$(openssl rand -hex 32)   # new
```

Each of these refuses to run rather than guessing. No `REMINDER_CRON_SECRET`
and the endpoint returns 503 — an unauthenticated endpoint that sends mail on
demand is worse than reminders that do not go out.

### Migrations

```
supabase db reset          # local
supabase db push           # a real project
```

Fifteen migrations. The last three are this feature. If `pg_cron` or `pg_net`
is unavailable, `20260819092000_reminder_cron.sql` is the one that fails —
enable both under Database → Extensions first. **This is the step I could not
verify here**; everything downstream of it was exercised against Postgres 16
with the two extensions stubbed.

### Cron config (only for scheduled runs)

Not needed while you are triggering the sweep by hand:

```sql
insert into private.app_config (key, value) values
  ('reminder_sweep_url',    'https://<host>/api/reminders/run'),
  ('reminder_sweep_secret', '<the same value as REMINDER_CRON_SECRET>');
```

## 1. Set up a brand that can send

`/brands` → a brand with an **email address**. Without one it sends nothing,
deliberately: `From` is shared infrastructure, so a client hitting reply would
reach nobody.

`/followups` → the brand's card → switch reminders on. You should see three
steps, each with a switch, a "days past due" box and a template select. The
three templates seeded at signup already match: Gentle nudge, Second
reminder, Final notice.

Pick a template for each step. A step without one reads *"Pick a template and
this step starts sending"* and is skipped — not an error.

**Expect at the bottom:** `3 of 3 steps will send, starting 3 days past the
due date.`

## 2. Set up something to chase

A client **with an email address** — your own, while `REMINDER_FROM_EMAIL` is
`onboarding@resend.dev`, since Resend will only deliver there until a domain
is verified.

An invoice for that client, status **Sent**, with a due date **in the past**.
Five days back is a good start.

## 3. Fire the sweep by hand

Do not wait for the hour.

```bash
curl -X POST http://localhost:3000/api/reminders/run \
  -H "Authorization: Bearer $REMINDER_CRON_SECRET"
```

**Expect:**

```json
{"considered":1,"sent":1,"blocked":0,"failed":0,"skipped":0,"reasons":{}}
```

A **307 to `/login`** means the auth proxy answered before the route did and
the bearer token was never read. `/api/reminders/run` is on `PUBLIC_PATHS` in
`lib/supabase/proxy.ts` precisely to stop that — it authenticates with a
secret rather than a session, because pg_cron calls it with nobody logged in.
If you see a 307, that entry has gone missing.

Then check, in order:

1. **The inbox.** Subject rendered from the template, `Reply-To` set to the
   brand's address.
2. **The invoice screen.** History shows `Gentle nudge · Sent · <date>`.
3. **The sidebar.** The plan card's meter has moved: `1 of 100`.

### Walking the whole sequence

Change the invoice's due date rather than waiting days. With offsets 3/10/21:

| Due date | Sweep sends |
|---|---|
| 5 days ago | Gentle nudge |
| 12 days ago | Follow-up |
| 25 days ago | Final notice |

Re-run the curl after each change. **A stage never repeats** — run the same
curl twice and the second returns `"skipped":1` with
`"reasons":{"already_claimed":1}`, which is the unique constraint doing its
job rather than a failure.

**Worth seeing deliberately:** set the due date to 60 days ago on a *fresh*
invoice and sweep once. It sends **Final notice**, not the nudge. An invoice
two months late should not receive "just floating this back to the top of your
inbox".

## 4. Manual chase

Once Final notice has gone, **"Chase again"** appears on the invoice. Before
that it is absent — the automatic sequence is still running and a manual send
would arrive saying much the same thing.

Fastest route to it: set all three offsets to `0` on a fresh overdue invoice
and sweep once. The furthest-owed rule sends Final immediately.

Click it. **Expect** a second email, threaded under the first in your client
(that is `In-Reply-To` and `References` doing their work), and a new history
row `Manual chase · Sent`.

## 5. The guardrails, which are worth testing on purpose

**Quota.** Drop the ceiling, then sweep:

```sql
update public.org_billing set email_limit_override = 1
where org_id = (select org_id from public.org_members limit 1);
```

**Expect** `"blocked":1`, a history row reading *"Monthly email limit reached
— 1 of 1 used on the Free plan"*, and a red meter in the sidebar. Raise the
override again and re-sweep: the blocked row **retries in place** rather than
being stuck.

**Suppression.**

```sql
insert into public.email_suppressions (email, reason, source)
values ('your@address.com', 'hard_bounce', 'manual');
```

**Expect** the next send blocked, with the reason on the invoice. Delete the
row to undo.

**No reply-to.** Clear the brand's email and sweep. **Expect** `"skipped":1`,
`"reasons":{"no_reply_to":1}`, and **no** history row — a refusal must not
burn the stage's slot, or that stage could never send once the address is
filled in.

## What will not work yet

- **Bounces do not populate the suppression list.** Nothing writes to it
  except by hand — `TODO(bounce-webhook)`, and the top item in
  `01-outliers-and-backlog.md`. Fine for testing; not fine before real
  customers are on the shared domain.
- **`failed` sends are never retried.** A transient failure is recorded and
  the slot stays claimed. Deliberate, not missing — see the backlog.
- **Upgrading to Pro charges nothing.** `/api/billing/tier` sets the tier
  from a request the app trusts. `renews_on` is fabricated a month out.
- **No screen in this feature has been looked at by anyone.** Types, lint,
  build and 822 unit tests, but no eyes. Expect layout surprises, especially
  the stage editor at narrow widths.
