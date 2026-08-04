/**
 * Feature flags for areas of the app that are UI/data-model complete but
 * have no real integration behind them yet. Flip a flag to `true` once the
 * real thing is built — the components, routes, hooks and tests for both
 * features stay in the tree either way, this just controls whether they're
 * reachable from the UI.
 *
 * - `billing`: the sidebar plan card, every "Pro" pill, and the upsell
 *   dialog (`plan-card.tsx` / `pro-dialog.tsx` / `use-plan.ts`).
 *   `usePlan().upgrade()` only flips a `localStorage` flag — no payment
 *   provider is wired up and no card is ever charged. Turning this on
 *   requires a real billing integration (e.g. Stripe/Razorpay) behind
 *   `usePlan`, and re-instates the Pro gate on brand creation
 *   (`brand-switcher.tsx`, `app/brands/page.tsx`) that is unconditionally
 *   open while this flag is off.
 * - `followups`: the "Follow-ups" nav item, the `/followups` and
 *   `/followups/templates/*` routes, and the follow-ups card on the
 *   invoice detail page. Schedules and reminder history persist to
 *   `localStorage` (`followups.ts`, `followup-queue.ts`, `templates.ts`)
 *   but no email is ever sent — "Send one now" only appends today's date
 *   to `invoice.reminders`. Turning this on requires a real outbound email
 *   integration behind `handleSendNow` in `app/invoices/[id]/page.tsx`.
 */
export const FEATURES = {
  billing: false,
  followups: false,
} as const;
