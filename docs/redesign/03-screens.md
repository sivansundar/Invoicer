# Screen-by-screen spec

Each section: what changes, and what deliberately does not.

## Shell — `components/layout/`

**Sidebar.** Six flat items become three labelled groups with dividers:

- **Essentials** — Dashboard, Follow-ups *(badge = queue count)*
- **Work** — Invoices *(count)*, Brands *(count)*, Clients *(count)*
- **Measure** — Reports

Active item is a **white pill** (`--surface`, hairline, `0 1px 2px` shadow) on
the grey sidebar; inactive is plain `--ink-2` text with no background. Sidebar
shares `--canvas` with the page and is separated by a right hairline, not by a
fill.

**"Invoices" now points at a list.** Today it links to `/invoices/create`,
so a nav item named after a noun performs a create action. It becomes
`/invoices`; creating is the header's primary button. `isNavItemActive` loses
its `/invoices/create` special case and the dashboard's claim on invoice
detail pages.

> This needs a route that does not exist yet: `app/(app)/invoices/page.tsx`.
> It renders the same `InvoiceDataTable` the dashboard uses, without the stat
> cards or chart.

**Header.** Page title in the display serif at 30px, preceded by the section
icon. Right cluster: a circular notification button, `Export` outline button,
and the blue primary. The `SidebarTrigger` moves into the sidebar header,
where the reference puts it.

**Brand switcher** keeps its position and behaviour; restyled only.

## Dashboard — `app/(app)/dashboard`, `components/dashboard/`

Order changes from *stats → chart → table* to:

1. **Scope row** — FY pill, brand segmented control, "Needs action" pill.
2. **Needs you** — three `ActionCard`s. This is the change that matters: the
   screen opens with things to *do*, not numbers to look at.
   - **Overdue** — count, oldest days late + total, **dark** button "Chase".
   - **Ready to send** — draft count, oldest draft age, "Review & send".
   - **Awaiting payment** — sent count, total across N clients, "View sent".
   All three derive from data already in `lib/dashboard.ts`; the only new
   helper is `oldestDraftAge`.
3. **Performance** — four `MetricCard`s: Revenue collected, Collection rate,
   Avg days to pay, Invoices issued. Each carries a `DeltaChip` and an
   explicit `vs <baseline>`. *Avg days to pay* is new and needs
   `avgDaysToPay(invoices)` in `lib/dashboard.ts`, computed from
   `paidOn − billDate` over paid invoices that have a `paidOn`.
4. **Split row** — `RankedBars` of revenue by brand, and the `ColumnChart`.
5. **Invoices that need you** — the existing `InvoiceDataTable`, restyled with
   `TwoLineCell`s and a per-row action button.

**Row actions are the second UX change.** "Chase" and "Finish" act from the
row. Marking paid still opens the invoice — it can require editing `paidOn`,
so a one-click row action would be lying about what it does.

The tabs, search, column toggle and pagination in `InvoiceDataTable` keep
their current behaviour; only their styling changes.

## Login — `app/(auth)/login`

Half and half. Left: `--canvas`-toned mesh gradient, wordmark, serif headline,
three feature ticks, and a sample invoice card. Right: the form.

**Google moves above the magic link** — one click versus leaving for an inbox.
Both call the same Supabase methods as today; `handleGoogle` and
`handleMagicLink` are unchanged, only reordered and restyled. The `sent` state
keeps its current copy.

No sign-in/sign-up fork: a line states the same button makes an account.

## Invoice detail — `app/(app)/invoices/[id]`

- An **action card** at the top when the invoice is overdue or a draft: the
  one thing to do, with its button on it.
- Parties become three cards: *Billed to*, *From*, *Dates & terms*.
- A **Lifecycle** rail — Drafted → Sent → (Overdue) → Paid, with dates from
  `createdAt`, `billDate`, `dueDate`, `paidOn`.
- Follow-ups card keeps its current logic, restyled, and gains a link to the
  brand's history.
- PDF preview thumbnail in the rail. It renders the existing preview
  component scaled down — it does not re-implement the invoice design.

## New / edit invoice — `components/invoices/invoice-form.tsx`

Restyle plus three interaction changes, all inside the existing form state:

- **Brand is a row of cards**, one click, instead of a select.
- **Terms are a segmented control** (Net 15/30/45/Custom) that derives the due
  date. Today both dates are typed independently. The derived value stays
  editable; picking a date manually switches the control to "Custom".
- **Recent clients as chips** above the client field.

The live preview pane and `react-hook-form` schema are unchanged.

## Brands / Clients

**Brands** keeps the card grid; each card gains collected vs outstanding, a
collection-rate `TickBar`, and its schedule summary.

**Clients moves from a card grid to a table** — 18 clients compared
side-by-side is a table job. New column *avg days to pay*, from the same
helper the dashboard uses.

## Reports

Currency cards first (one per currency in use), then the column chart, then
the month-by-month table, then import/export. Grouping by currency before
anything else matches how `lib/reports.ts` already aggregates.

## Follow-ups

Restyled, plus the per-brand entry point. See `02-followup-history.md`.
