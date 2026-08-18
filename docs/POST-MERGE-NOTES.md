# Post-merge notes

Written at the end of the shadcn rewrite (branch `feat/shadcn-rewrite`, 54 commits,
354 tests). Everything here is either a deliberate gap or a known residual — none of it
blocked merge, but none of it should be forgotten either.

**Amended by the Phase 3.5 bug-fix branch (`fix/phase3.5-bug-fixes`)** to strike residuals that
branch closed, and to correct one that was already false when this document was carried forward:
the "four save-failure guards are unpinned by tests" line claimed only `handleMarkPaid` had a
test, but `handleMarkSent`, `handleTogglePause`, `handleSendNow` and `handleDelete` all had
covering, non-vacuous tests in `src/app/(app)/invoices/[id]/page.test.tsx` already —
`docs/PHASE4-CARRYOVER.md` said as much in its own "Test gaps worth closing" section, and would
have settled the question without touching any code. A stale carry-over line is not evidence; the
code and, failing that, the *other* carry-over document, both outrank it.

## Not implemented — these look real and are not

Both are labelled `// MOCK:` in source, but they are convincing enough on screen to be
mistaken for working features.

- **Pro / billing.** The plan card, "Pro" pills, upsell dialog and the `₹499/mo` line all
  work. `usePlan().upgrade()` flips a `localStorage` flag. **No payment is ever taken and
  no card is stored.**
- **Follow-ups email.** Per-brand schedules, the queue, reminder history and "Send one now"
  all persist and update. **No email is ever sent.** "Send one now" appends today's date to
  the invoice's `reminders` array and shows a toast — nothing leaves the browser.
- **Auth.** Deliberately omitted. There is no login, no session, no user record. The
  sidebar shows a static local user.

## Next planned work

**`Invoice.paidOn`** — an editable payment date, agreed but not yet built. Records when
payment actually arrived, as distinct from `billDate`. Editable after the fact because you
mark an invoice paid when you *notice*, not when the money landed — which misplaces revenue
across a financial-year boundary. Moves the dashboard chart onto payment dates; the FY
summary report correctly stays on bill dates. Full design in
`.superpowers/sdd/2026-07-28-shadcn-rewrite/progress.md` under "TASK 23".

## Known residuals

- **`@react-pdf/renderer` logs a `getItem` error** during FY-summary PDF generation. The PDF
  generates and downloads correctly. Traced: no application code in that chain touches
  `localStorage`, so it is library-internal. Revisit only if PDF generation ever fails.
- **`CURRENCY_ORDER` is duplicated** in `src/lib/money.ts` and `src/lib/reports.ts`. Hoist to
  one exported constant next time either file is touched.
- **`loading` and `refresh` are dead** on all four collection hooks — leftover API shape from
  before `useSyncExternalStore`. No consumers.
- **`usePlan().downgrade` is never called.**
- **A corrupted custom email template** is silently replaced by the seeded defaults with no
  quarantine trail, unlike corrupted brands/clients/invoices which are quarantined.
- **`site-header.tsx` shows "New client"** when editing an existing client. The sibling brand
  route handles this correctly. Locked by a test transcribed from the design handoff's
  breadcrumb table, so fixing it means updating that spec row too.
- **`defaultFollowupConfig()` hardcodes `templateId: "tpl-gentle-nudge"`.** The delete guard
  only blocks removing a template a brand *currently* uses, so deleting "Gentle nudge" while
  unused leaves every later-created brand pointing at a template that no longer exists.
  Degrades quietly to "—", no crash.
- **`import-export.tsx` has no component test harness**, so the `deleteInvoice`-result fix in
  the overwrite path is browser-verified but not automated.

## Rollback hazard — read before reverting

The migration is safe and additive, but **reverting to pre-rewrite code after creating new
invoices is not.**

New invoices are numbered `SC-2026-001`. The old numbering code matched on
`` `${prefix}${year}` `` with no hyphens, so `"SC-2026-001".startsWith("SC2026")` is `false`
— old code cannot see new-format invoices, would restart the sequence at `001`, and would
**issue duplicate invoice numbers**.

Migrating forward is safe. Creating invoices and then rolling back is not.
