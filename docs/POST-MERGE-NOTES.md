# Post-merge notes

Written at the end of the shadcn rewrite (branch `feat/shadcn-rewrite`, 54 commits,
354 tests). Everything here is either a deliberate gap or a known residual — none of it
blocked merge, but none of it should be forgotten either.

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
- **`Brand.nextInvoiceNumber` is dead state.** Still on the type and still written, but
  nothing reads it — invoice numbering derives from the invoice list. Two sources of truth
  where only one is live. Safe to remove; the comment in `brand-form.tsx` claiming Task 22
  would remove it is now stale.
- **`CURRENCY_ORDER` is duplicated** in `src/lib/money.ts` and `src/lib/reports.ts`. Hoist to
  one exported constant next time either file is touched.
- **`loading` and `refresh` are dead** on all four collection hooks — leftover API shape from
  before `useSyncExternalStore`. No consumers.
- **`usePlan().downgrade` is never called.**
- **Export covers invoices only**, not brands, clients or templates. The Reports copy was
  corrected to say so. A fuller `{ brands, clients, invoices, templates }` envelope would
  change the import contract — worth doing, deliberately deferred.
- **A corrupted custom email template** is silently replaced by the seeded defaults with no
  quarantine trail, unlike corrupted brands/clients/invoices which are quarantined.
- **`site-header.tsx` shows "New client"** when editing an existing client. The sibling brand
  route handles this correctly. Locked by a test transcribed from the design handoff's
  breadcrumb table, so fixing it means updating that spec row too.
- **Client delete has no confirmation dialog**, while invoice delete does and brand delete is
  guard-refused. Client delete is arguably the most consequential of the three — it removes
  the record *and* rewrites `clientId` on every referencing invoice.
- **`defaultFollowupConfig()` hardcodes `templateId: "tpl-gentle-nudge"`.** The delete guard
  only blocks removing a template a brand *currently* uses, so deleting "Gentle nudge" while
  unused leaves every later-created brand pointing at a template that no longer exists.
  Degrades quietly to "—", no crash.
- **Native `alert()` survives in two places** (`pdf-download-button.tsx`,
  `summary-report-dialog.tsx`) in an app that otherwise standardised on toasts.
- **Four save-failure guards are unpinned by tests** — `handleMarkSent`, `handleTogglePause`,
  `handleSendNow`, `handleDelete`. Guarded in code; only `handleMarkPaid` has a test.
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
