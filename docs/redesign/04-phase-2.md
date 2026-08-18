# Phase 2 — the pending mockup features

Branch: `claude/redesign-phase-2`, stacked on `claude/redesign-remaining-screens`
(PR #14). **Merge #14 first**; this then merges cleanly to `v1`.

Built with subagents, one work package each. Packages own disjoint files so
they can run in parallel; nothing below edits `components/ui/primitives.tsx`,
which is read-only for this phase.

## Feature flags are now on — and both are still facades

`FEATURES.billing` and `FEATURES.followups` are `true`. That made the screens
reachable. It did **not** add an email provider or a payment provider.

| Flag | What is real | What is faked |
|---|---|---|
| `followups` | Schedules, reminder history and the queue's maths all persist to Postgres | **No email is ever sent.** "Send one now" appends today's date to `invoice.reminders`; scheduled sends are computed, never dispatched |
| `billing` | Plan state persists | **No payment is taken.** `usePlan().upgrade()` flips a flag; no card, no provider, no Razorpay |

Every faked call site is labelled `MOCK:`. Grep for it before trusting
anything here to reach the outside world.

**Behaviour change worth knowing:** turning `billing` on re-instates the Pro
gate on brand creation. A free account with one brand now meets the upsell
instead of a second brand. Upgrading is instant and free, so it is a click,
not a wall — but it is a real gate, and it is the first thing to switch off
if it gets in the way.

## Work packages

| # | Package | Owns |
|---|---|---|
| 1 | Command palette — make the sidebar search real | `components/layout/command-palette.tsx` (new), `app-sidebar.tsx` |
| 2 | Sidebar setup card + plan footer | `components/layout/setup-card.tsx` (new), `plan-card.tsx`, `user-menu.tsx` |
| 3 | Dashboard scope row | `components/dashboard/scope-row.tsx` (new), `dashboard/page.tsx` |
| 4 | Clients summary cards + toolbar | `app/(app)/clients/page.tsx` |
| 5 | Follow-ups action cards | `app/(app)/followups/page.tsx` |
| 6 | Brands prompt cards | `app/(app)/brands/page.tsx` |
| 7 | Reports chart + month table | `app/(app)/reports/page.tsx`, `lib/reports.ts` |
| 8 | New-invoice recent-client chips | `components/invoices/invoice-form.tsx` |

## Rules every package follows

- **Design system only.** Tokens (`--ink`, `--canvas`, `--surface`, `--line`,
  `--blue`/`--green`/`--amber`/`--red`/`--violet`) and the primitives in
  `components/ui/primitives.tsx`. No new colours, no new radii.
- **Derive, never invent.** Every number comes from real records. Where a
  figure cannot be derived, show "—" and say why, as `avgDaysToPay` does.
  A fabricated number in a headline is worse than an absent one.
- **Money groups by currency**, never sums across it — `groupTotalsByCurrency`.
- **Pure logic goes in `lib/` with tests.** Components stay thin.
- **No dead controls.** Anything that looks clickable does something, or it
  does not ship. This phase exists partly because the earlier one shipped a
  decorative Export button and bell.

## Deliberately still not built

- The named 3-step reminder sequence (*Due soon → Gentle nudge → Final
  notice*) — the model has one cadence and one template. Needs a schema
  change; see `02-followup-history.md`.
- "Opened, not paid" outcomes — no open tracking exists.
- "Copy payment link" — no payment-link feature exists.
- The notification bell — its dot implied unread items nothing counts.
