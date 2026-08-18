# Redesign artboards

Source for the **Invoicer Redesign** design canvas. Each `*.dc.html` is one
artboard; `canvas.json` places them on three pages (Core screens, Manage,
System & before).

- `lib.mjs` — design tokens (oklch), icons, and the shared component vocabulary
  (buttons, status pills, icon tiles, delta chips, tick bars, dotted charts).
- `shell.mjs` — the app shell: grouped sidebar, page top bar, segmented control.
- `doc.mjs` — wraps a screen body in a Design Component document.
- `dashboard.mjs`, `login.mjs`, `invoice.mjs`, `newinvoice.mjs`,
  `screens2.mjs` (brands, clients), `screens3.mjs` (follow-ups, reports),
  `components.mjs` — one screen each.
- `Today.dc.html` — the current dashboard, rebuilt from the real values in
  `src/app/globals.css` and the shipped components, as an honest "before".

Regenerate the artboards with `node build.mjs`. The published canvas is seeded
from these files; the seeded output is not committed.
