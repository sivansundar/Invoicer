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

## What shipped

All eight packages landed. Each is one commit, reviewed against the code
rather than against its agent's report.

| # | Package | Commit |
|---|---|---|
| 6 | Brands prompt cards | `50d0267` |
| 7 | Reports chart + month table | `083643b` |
| 4 | Clients summary cards + toolbar | `df289c6` |
| 5 | Follow-ups action cards | `0072ed1` |
| 8 | New-invoice recent-client chips | `baffe4e` |
| 3 | Dashboard scope row | `54b21b7` |
| 2 | Setup card + plan footer | `b85b897` |
| 1 | Command palette | `710584b` |

Plus two follow-ups outside the package table: mounting `SetupCard` and
clearing the sidebar's last two dead controls (`2cc1360`), and honouring the
`?tab=` the dashboard had been linking with (`6372afa`).

Verified at the end: `npx vitest run` → 67 files, 789 tests passing;
`npx tsc --noEmit` clean; `npx eslint` clean; `npx next build` succeeds.

## Deliberately not built, and why

Beyond the list above, each package declined something the mockup shows:

- **The dashboard's "Needs action" pill.** As a filter it cannot mean
  anything distinct from the "Needs you" section directly below it, and
  applying it across Performance would report a collection rate of 0%,
  since those cards measure money already *collected*. In its slot is a
  control that only appears when it is true: the overdue invoices the year
  scope is hiding, with one click to widen to all years.
- **The setup card's "Next" button.** The only thing it could honestly do is
  follow the same href as the button in the strip directly above it.
- **"Plan & billing" as a link** in the user footer. No such screen exists —
  the plan is managed by the card immediately above — so line two states the
  tier instead.
- **The new-invoice form's dashed `+ New client` chip.** There is no in-form
  client creation, and a link to `/clients/create` would abandon a half-filled
  invoice. The select's "Enter manually…" covers the one-off case.
- **The sidebar's group-collapse chevrons and "Help & support" row.** Removed
  rather than made real: nothing collapses, and there is no help destination
  to point at.

## Known gaps, not addressed by this phase

- `stat-cards.tsx` names a variable `issuedThisYear` while counting every
  non-draft invoice ever. Now that the dashboard is FY-scoped by default the
  name happens to be true, but the card never names the year in its label.
- `revenue-chart.tsx` keeps a trailing 12-month window that now sits inside
  an FY scope. At the default year they agree; select an older FY and the
  chart correctly shows near-nothing. Nothing is fabricated, but the card
  says only "Paid invoices only · approximate across currencies" and never
  names a year, so the two scopes read as one.
- A brand deleted while it is the selected brand filter leaves a stale id in
  localStorage: every dashboard section filters to nothing while the brand
  switcher and the scope row both display "All brands". Pre-existing — the
  switcher has always resolved a missing brand to `null` for display without
  clearing the stored value.
- `brand-switcher.tsx` still comments that brand creation is unrestricted
  "while billing is hidden". `FEATURES.billing` is now `true`; the code is
  right, the comment is stale.
