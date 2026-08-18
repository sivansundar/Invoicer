# Invoicer redesign — plan

**Branch:** `claude/app-redesign-implementation`, forked from `v1`.
**Mockups:** the design canvas ([Invoicer Redesign](https://claude.ai/code/artifact/eb0abb00-f162-43dd-beca-ac0a2c14f7f9)), sources on
`claude/app-redesign-mockup-bgssg9` under `design/`.

## What this is

A visual redesign of the whole app plus one new feature (per-brand follow-up
history). The reference is a warm-grey canvas with white cards floating on it,
a grouped sidebar, colored icon tiles, metrics that always name their
comparison baseline, and two-line table cells.

It is **not** a rewrite. Routes, data model, hooks, storage and PDF rendering
are unchanged except where a section below says otherwise. The invoice
document designs (`components/invoices/designs/*`) are deliberately untouched —
they are print artefacts with their own visual language, and changing them
would invalidate every frozen brand snapshot's appearance.

## Order of work

Each phase is independently reviewable and leaves the app running.

| # | Phase | Touches |
|---|---|---|
| 1 | Tokens and fonts | `app/globals.css`, `app/layout.tsx` |
| 2 | Shared primitives | `components/ui/*` (new files only) |
| 3 | App shell | `components/layout/*` |
| 4 | Dashboard + login | `components/dashboard/*`, `app/(auth)/login` |
| 5 | Remaining screens | invoices, brands, clients, reports |
| 6 | Per-brand follow-up history | `lib/followup-history.ts` (new), `app/(app)/followups/brands/[id]` (new) |
| 7 | Lint, tests, build | — |

## Decisions taken, with their reasons

**The palette gains colour; the app is currently fully desaturated.** Every
token in `globals.css` today is `oklch(L 0 0)`. The redesign needs colour to
carry meaning — overdue vs sent vs paid, and four brand series in a chart. The
categorical order (blue → amber → violet → green) was run through a
colour-vision and contrast validator rather than chosen by eye; amber sits at
`oklch(0.66 0.15 62)` specifically because the lighter step failed 3:1 against
white.

**Dark mode is re-derived, not flipped.** The warm canvas/white-card
relationship inverts to a near-black canvas with raised surfaces. Accents get
their own dark steps — the light steps are too dark to read on a dark surface.

**Fonts change to Instrument Sans + Instrument Serif + JetBrains Mono.** All
three are Google Fonts, loaded through `next/font/google`, so they self-host at
build time and add no runtime request. The serif is restricted to page titles
and the login headline; at 19px on section labels it read thin.

**Follow-up history is built on the data model that exists.** See
`02-followup-history.md` — the mockup showed a named three-step sequence
(*Due soon → Gentle nudge → Final notice*) that the app does not have, and this
implementation does not invent one.

## Out of scope, stated explicitly

- **The invoice PDF/preview designs.** Untouched, as above.
- **`FEATURES.billing`.** Still `false`; the plan card and Pro upsell stay
  behind it and are restyled but not enabled.
- **`FEATURES.followups`.** Still `false`. The follow-ups screens — including
  the new per-brand history — are restyled and built, but remain unreachable
  from the nav until a real outbound email integration exists. The mockups show
  them as though the flag were on.
- **Email open/click tracking.** No such data exists, so no outcome in the
  history screen claims it.
