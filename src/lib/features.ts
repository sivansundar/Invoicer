/**
 * Feature flags for areas of the app that are UI/data-model complete but
 * have no real integration behind them yet. The components, routes, hooks
 * and tests for both features stay in the tree either way; this controls
 * whether they're reachable from the UI.
 *
 * BOTH ARE NOW ON, AND BOTH ARE STILL FACADES. Turning them on made the
 * screens reachable; it did not add an email provider or a payment provider.
 * Every call site that fakes something is labelled `MOCK:` — grep for it
 * before assuming any of this talks to the outside world. The features the
 * mockups show but the model cannot yet support are labelled `TODO(slug):`
 * at the place they would be built; `grep -rn "TODO(" src` lists all five:
 *
 * - `TODO(bounce-webhook)` — `lib/reminder-store.ts`. The most urgent: the
 *   suppression list is read on every send and nothing writes to it yet.
 * - `TODO(payment-provider)` — `hooks/use-plan.ts`, `api/billing/tier`
 * - `TODO(payment-link)` — `app/(app)/invoices/[id]/page.tsx`
 * - `TODO(open-tracking)` — `lib/followup-history.ts`
 * - `TODO(drop-legacy-cadence)` — `lib/types.ts`
 *
 * `TODO(email-provider)` and `TODO(reminder-sequence)` are gone: reminders
 * are sent through Resend by a real scheduler, and the three-stage sequence
 * exists. See `docs/reminders/`.
 *
 * - `billing`: the sidebar plan card, every "Pro" pill, and the upsell
 *   dialog (`plan-card.tsx` / `pro-dialog.tsx` / `use-plan.ts`).
 *   `usePlan().upgrade()` only flips a `localStorage` flag — no payment
 *   provider is wired up and no card is ever charged.
 *
 *   NOTE, because it changes behaviour rather than just revealing UI:
 *   turning this on re-instates the Pro gate on brand creation
 *   (`brand-switcher.tsx`, `app/brands/page.tsx`), which was
 *   unconditionally open while the flag was off. A free account that
 *   already has one brand now meets the upsell instead of a second brand.
 *   Upgrading is instant and costs nothing, so this is a click, not a wall
 *   — but it is a real gate, and it is the first thing to turn off again if
 *   it gets in the way before a payment provider exists.
 *
 * - `followups`: the "Follow-ups" nav item, the `/followups`,
 *   `/followups/brands/*` and `/followups/templates/*` routes, and the
 *   follow-ups card on the invoice detail page. NO LONGER A FACADE —
 *   reminders are composed and sent through Resend by an hourly sweep, and
 *   `reminder_sends` records what actually went out. What remains faked is
 *   named in `docs/reminders/01-outliers-and-backlog.md`; the one that
 *   matters is that nothing yet writes bounces to the suppression list.
 *
 */
export const FEATURES = {
  billing: true,
  followups: true,
} as const;
