/**
 * Feature flags for areas of the app that are UI/data-model complete but
 * have no real integration behind them yet. The components, routes, hooks
 * and tests for both features stay in the tree either way; this controls
 * whether they're reachable from the UI.
 *
 * BOTH ARE NOW ON, AND BOTH ARE STILL FACADES. Turning them on made the
 * screens reachable; it did not add an email provider or a payment provider.
 * Every call site that fakes something is labelled `MOCK:` — grep for it
 * before assuming any of this talks to the outside world.
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
 *   follow-ups card on the invoice detail page. Schedules and reminder
 *   history persist to Postgres like everything else, but NO EMAIL IS EVER
 *   SENT — "Send one now" only appends today's date to `invoice.reminders`,
 *   and the queue's scheduled sends are computed, never dispatched. Every
 *   figure the follow-up screens show is therefore real data about
 *   reminders that were recorded, not delivered. Turning this into a real
 *   feature needs an outbound email integration behind `handleSendNow` in
 *   `app/invoices/[id]/page.tsx` and a scheduler for the queue.
 */
export const FEATURES = {
  billing: true,
  followups: true,
} as const;
