# Per-brand follow-up history

New screen: **`/followups/brands/[id]`**, reached from a "View all N sent"
button on each brand's card on `/followups`.

## The mockup shows a schedule this app does not have

The artboard renders a three-step named sequence — *Due soon* (3 days before
due) → *Gentle nudge* (7 days after) → *Final notice* (21 days after). **That
is not the data model.** What exists is:

```ts
interface FollowupConfig {
  enabled: boolean;
  mode: "weekly" | "custom";
  weekday: number;       // custom mode only
  time: string;          // "HH:mm"
  repeat: "week" | "month";
  templateId: string;    // ONE template, for every reminder
  stopAfter: number;     // 0 = never stop
}
```

A brand has **one repeating cadence and one template**. Reminders are not
named and do not differ from each other; the only thing distinguishing the
second reminder from the first is that it is the second.

`Invoice.reminders` is `string[]` — the `yyyy-MM-dd` dates a reminder was
recorded. That is the entire history record.

**This implementation builds on the real model.** Reminders are identified by
**ordinal** — "Reminder 1", "Reminder 2" — not by invented names. Moving to a
named multi-step sequence is a separate change: it needs a schema migration, a
per-step template mapping, and a rewrite of `nextSendDate`. Flagged, not done.

## Outcomes must be derivable

The mockup shows an "Opened, not paid" outcome. **There is no open tracking** —
nothing sends email (`FEATURES.followups` is `false`) and no provider webhook
exists. That outcome is dropped. The four that are derivable from
`reminders[]`, `status` and `paidOn`:

| Outcome | Rule |
|---|---|
| `paid` — "Paid N days later" | This is the last reminder at or before `paidOn`, and the invoice is `paid`. `N = paidOn − sentOn` in days; `N = 0` renders "Paid same day". |
| `escalated` — "Followed by reminder N+1" | A later reminder exists, so this one did not result in payment. |
| `pending` — "No reply yet" | Last reminder, invoice still unpaid. |
| `unknown` — "Paid, date unknown" | Invoice is `paid` but `paidOn` is undefined (invoices paid before that field existed are never backfilled). |

A reminder dated *after* `paidOn` is impossible in normal use but must not
throw — it falls through to `unknown`.

## Aggregates

Per brand, over that brand's invoices:

| Figure | Definition |
|---|---|
| Reminders sent | `Σ invoice.reminders.length` |
| Invoices chased | count of invoices with `reminders.length > 0` |
| Recovered | total of invoices that are `paid` **and** have ≥1 reminder at or before `paidOn` |
| Avg reminders to payment | mean `reminders.length` over recovered invoices |
| Pays after a nudge | recovered ÷ chased-and-paid, as a percentage |
| Still unanswered | chased invoices that are unpaid |

**Money is grouped by currency, never summed across it.** The app bills in
INR, USD and SGD; a single "₹4,12,000 recovered" figure across currencies
would be wrong. Reuse `groupTotalsByCurrency` / `formatCurrencyGroups` from
`lib/money.ts`, exactly as the dashboard stat cards already do.

## "Which nudge works"

Recovery rate by **reminder ordinal**: of all invoices that received an Nth
reminder, the share that were paid within 7 days of it. This works on the real
model — ordinal is well-defined even though the reminders are identical in
content — and it answers a real question: whether the cadence is too slow.

`RECOVERY_WINDOW_DAYS = 7`, exported so the copy ("within 7 days") and the
maths cannot drift.

Rows with a denominator below 3 render "not enough data" rather than a
percentage — a 100% rate from one invoice is noise.

## New module: `src/lib/followup-history.ts`

Pure functions, no React, unit-tested alongside `followups.test.ts`:

```ts
export const RECOVERY_WINDOW_DAYS = 7;

export type ReminderOutcome = "paid" | "escalated" | "pending" | "unknown";

export interface ReminderEvent {
  invoice: Invoice;
  sentOn: string;        // yyyy-MM-dd
  ordinal: number;       // 1-indexed
  outcome: ReminderOutcome;
  daysToPayment: number | null;   // set only when outcome === "paid"
}

export function brandReminderHistory(invoices: Invoice[]): ReminderEvent[];
export function groupEventsByMonth(events: ReminderEvent[]): MonthGroup[];
export function brandFollowupSummary(invoices: Invoice[]): FollowupSummary;
export function recoveryByOrdinal(invoices: Invoice[]): OrdinalRecovery[];
```

`brandReminderHistory` returns newest-first. Every function takes an
already-filtered invoice list — the route filters by `brandId`, so these stay
brand-agnostic and testable.

## Route and reachability

`app/(app)/followups/brands/[id]/page.tsx`, a client component using the
existing `useInvoices` / `useBrands` hooks. It sits under the existing
`FEATURES.followups` gate along with the rest of `/followups` — building it
does not make it reachable, and it should not, until reminders are actually
sent. `getCrumb` in `site-header.tsx` gains a case for it.
