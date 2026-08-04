# Hide billing/Pro and follow-ups from the UI

Branch `feat/shadcn-rewrite`, starting HEAD `b947ebf`.

## Flag module

`src/lib/features.ts` — new file:

```ts
export const FEATURES = {
  billing: false,
  followups: false,
} as const;
```

Doc comment on the module explains why each is off and what turning it back on
requires (billing: a real payment provider behind `usePlan`, plus re-enabling
the Pro gate on brand creation that is unconditionally open while the flag is
off; follow-ups: a real outbound-email integration behind `handleSendNow` in
the invoice detail page). Nothing under `src/lib`, `src/hooks` or
`src/components/followups`/`plan-card.tsx`/`pro-dialog.tsx` was deleted —
only call sites were gated.

## Every site gated

**Billing (`FEATURES.billing`):**
- `src/components/layout/app-sidebar.tsx` — `PlanCard` only renders inside
  `{FEATURES.billing && <PlanCard />}` in the sidebar footer. The user row
  below it (avatar, name, email) is unconditional and still renders directly
  under the nav.
- `src/components/layout/brand-switcher.tsx` — the `· Pro`/`· Free` suffix
  on the selected brand's subtitle only appears when `FEATURES.billing`;
  otherwise just the invoice prefix shows. The "Pro" badge next to "Add
  brand" is gated the same way. `<ProDialog>` itself is only mounted when
  `FEATURES.billing` is true.
- `src/app/brands/page.tsx` — the `ProPill` next to "New brand" and "Add
  another brand" is gated behind `FEATURES.billing`; `<ProDialog>` is only
  mounted when the flag is on.

**Follow-ups (`FEATURES.followups`):**
- `src/components/layout/app-sidebar.tsx` — `NAV_ITEMS` is now filtered from
  an `ALL_NAV_ITEMS` list; the "Follow-ups" entry carries `flag: "followups"`
  and is dropped from the rendered list when the flag is off.
- `src/app/invoices/[id]/page.tsx` — `showFollowups` now starts with
  `FEATURES.followups &&`, so the entire follow-ups card (Active/paused
  pill, next-send line, reminder history, Pause/Send-one-now row) doesn't
  render. `handleSendNow` and `handleTogglePause` are left in place with a
  comment noting they're unreachable while the flag is off.
- `src/app/followups/page.tsx`, `src/app/followups/templates/create/page.tsx`,
  `src/app/followups/templates/[id]/page.tsx` — each now does
  `useEffect(() => { if (!FEATURES.followups) router.replace("/"); }, [router])`
  and returns `null` while the flag is off, so nothing behind the flag ever
  paints.

## Direct-visit decision: redirect, not 404

Chose a client-side `router.replace("/")` (dashboard) over `notFound()`/404.
Reasoning: the routes are real and fully functional, just switched off
temporarily — a 404 would misrepresent that as a broken/mistyped URL, which
is actively misleading for a bookmark or a stale link. A redirect to the
dashboard is a graceful no-op that requires zero route restructuring to
reverse: flipping `FEATURES.followups` to `true` is the entire "bring it
back" step, no code path needs to change shape. The three follow-ups pages
are all `"use client"` (they use hooks), so the guard is a `useEffect` +
early `return null` rather than a server-side `redirect()` call.

## Removing the Pro gate from brand creation ("the trap")

Both entry points (`brand-switcher.tsx`'s "Add brand" item and
`brands/page.tsx`'s `handleNewBrand`) now read:

```ts
if (!FEATURES.billing || isPro) {
  router.push("/brands/create");
} else {
  setProDialogOpen(true);
}
```

With `FEATURES.billing` false, the gate collapses to always-navigate,
regardless of `isPro` — brand creation is fully unrestricted. The `isPro`
branch is preserved so that flipping `FEATURES.billing` back to `true`
restores the original Pro-gated behavior with no other code change.

## Breadcrumb map / nav-active logic

Checked `src/components/layout/site-header.tsx`: `getCrumb` still maps
`/followups` and `/followups/templates/*` to "Follow-ups"/"Email template".
Left unchanged — it's covered by `site-header.test.ts` (asserts these exact
mappings), and since the pages themselves redirect before ever rendering the
header with that crumb, the entries are inert rather than reachable dead UI.
`isNavItemActive`/`showNewInvoiceAction` are generic path matchers with no
follow-ups- or billing-specific branches, so nothing there needed touching.

## Test changes

- `src/app/invoices/[id]/page.test.tsx`: added
  `vi.mock("@/lib/features", () => ({ FEATURES: { billing: false, followups: true } }))`
  so this file keeps exercising the real `handleTogglePause`/`handleSendNow`
  write-failure behavior via the rendered "Pause follow-ups"/"Send one now"
  buttons — that coverage is only reachable through the card, which is
  otherwise hidden by default.
- New `src/app/invoices/[id]/followups-hidden.test.tsx`: does **not** mock
  `@/lib/features` (exercises the real, shipped default of
  `followups: false`) and asserts the follow-ups card/heading and its two
  buttons are absent even when an invoice has reminder history, and that
  status actions/preview/delete still render normally alongside it.

No other test files needed changes — everything else in the 404-test
baseline exercises library/hook logic or components that are still fully
reachable (e.g. `use-plan.test.ts`, `pro-dialog.test.tsx`, `followups.test.ts`,
`followup-queue.test.ts`, `templates.test.ts` all test the underlying
code directly, not through the now-gated UI).

## Verification

Run against final state (branch also carries a concurrent agent's in-flight
per-brand invoice-template work in `migrate.ts`/`types.ts`/`invoice-preview.tsx`/
`invoice-pdf.tsx`/`brand-form.tsx`/new `designs/` components — none of which I
touched; during the session their WIP caused transient tsc/test failures
confined entirely to their own files, which resolved once their edit passed):

```
npm test            -> Test Files 34 passed (34) / Tests 429 passed (429)
npx tsc --noEmit | grep -c "error TS"   -> 0
npm run lint | grep -E "problems|✖"     -> "2 problems (0 errors, 2 warnings)"
                                            (2 pre-existing next/image warnings
                                            in the other agent's new design
                                            components — 0 lint errors)
npm run build        -> succeeds
```

Test count: 429 = 404 original + 2 new (`followups-hidden.test.tsx`) + ~23
from the concurrent agent's in-flight invoice-template-design work (not
mine — their `migrate.test.ts`/`classic-invoice-preview.test.tsx`/
`invoice-design.test.ts` additions).

## Browser verification (Playwright, `npm install --no-save playwright`,
cached Chromium, `next dev`)

1. **No plan card, no Pro pill, no upsell dialog anywhere** — checked
   dashboard and `/brands`: no "Upgrade to Pro"/"Manage billing"/"₹499"
   text, zero exact-match "Pro" badges. Confirmed visually via dark-mode
   screenshot (sidebar footer shows only the user row, no plan card).
2. **"Add brand" works from every entry point** — clicked the sidebar
   brand-switcher's "Add brand" item and the brands page's "New brand"
   button; both navigate straight to `/brands/create` with no dialog.
3. **No Follow-ups nav item; direct visits redirect** — `/followups` and
   `/followups/templates/create` both land back on `/` (dashboard) rather
   than rendering the screen or a 404; no "Follow-ups" link in the sidebar.
4. **Invoice detail page renders correctly without the follow-ups card** —
   seeded a brand + a sent, overdue invoice with reminder history directly
   in `localStorage`; loaded `/invoices/i1`: no "Follow-ups" text anywhere
   on the page, while "Mark as paid", "Download PDF", "Edit", the client
   preview pane, and the delete dialog (open + cancel) all worked.
   Screenshot confirms the layout is intact and simply shorter.
5. **Dark mode** — toggled the theme; `<html>` picked up the `dark` class,
   nav/plan-card-absence/status all render correctly (screenshot attached
   to this session).

Playwright uninstalled afterwards (`npm uninstall --no-save playwright`);
`git diff package.json` is empty.

## Turning each feature back on

- **Billing**: build a real payment integration behind `usePlan()` in
  `src/hooks/use-plan.ts` (currently `upgrade()`/`downgrade()` just flip a
  `localStorage` flag), then flip `FEATURES.billing` to `true` in
  `src/lib/features.ts`. That alone re-instates the plan card, every Pro
  pill, the upsell dialog, and the Pro gate on brand creation — no other
  code changes needed.
- **Follow-ups**: wire a real outbound-email send behind `handleSendNow` in
  `src/app/invoices/[id]/page.tsx` (currently only appends today's date to
  `invoice.reminders`), then flip `FEATURES.followups` to `true`. That
  restores the nav item, the `/followups` routes (no longer redirecting),
  and the follow-ups card + its Pause/Send-one-now actions on the invoice
  detail page.
