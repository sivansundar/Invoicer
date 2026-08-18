# Design system spec

Every value here is what the mockups actually use. Colours are oklch so they
drop into `globals.css` unchanged.

## Surfaces

The single biggest change: the page is a **warm grey**, and content sits on
**white cards** floating on it. Today the page is white and cards are white,
so the only thing separating them is a hairline.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `oklch(0.955 0.004 70)` | `oklch(0.165 0.004 70)` | page + sidebar |
| `--surface` | `oklch(1 0 0)` | `oklch(0.215 0.004 70)` | cards |
| `--surface-2` | `oklch(0.98 0.004 70)` | `oklch(0.255 0.004 70)` | inset panels inside cards |
| `--field` | `oklch(0.928 0.004 70)` | `oklch(0.275 0.004 70)` | filled inputs, segmented track |
| `--line` | `oklch(0.898 0.004 70)` | `oklch(1 0 0 / 12%)` | card borders, dividers |
| `--line-2` | `oklch(0.932 0.004 70)` | `oklch(1 0 0 / 7%)` | row separators, grid |
| `--ink` | `oklch(0.19 0.004 70)` | `oklch(0.97 0.004 70)` | primary text |
| `--ink-2` | `oklch(0.52 0.008 70)` | `oklch(0.72 0.008 70)` | secondary text |
| `--ink-3` | `oklch(0.66 0.008 70)` | `oklch(0.58 0.008 70)` | tertiary, axis labels |

## Accents

Semantic first, categorical second. **Categorical order is fixed:
blue → amber → violet → green** and must never be reordered or cycled — a
reader who learned "Avara Labs is amber" is misled if a filter repaints it.

| Token | Light | Dark | Means |
|---|---|---|---|
| `--blue` | `oklch(0.52 0.16 258)` | `oklch(0.68 0.15 258)` | primary action, `sent` |
| `--green` | `oklch(0.60 0.145 152)` | `oklch(0.72 0.15 152)` | `paid`, collected, improving |
| `--amber` | `oklch(0.66 0.15 62)` | `oklch(0.78 0.15 62)` | `draft`, series 2 |
| `--red` | `oklch(0.585 0.205 27)` | `oklch(0.70 0.19 27)` | `overdue`, worsening |
| `--violet` | `oklch(0.575 0.185 295)` | `oklch(0.72 0.17 295)` | series 3 |

Each has a `-soft` companion for pill backgrounds: light
`oklch(0.95 0.03–0.045 <hue>)`, dark `oklch(0.30 0.05 <hue>)`.

> **Validated, not eyeballed.** Under the dataviz validator, the light
> categorical set passes lightness band, chroma floor, CVD separation
> (worst adjacent ΔE 23.4 deutan) and 3:1 contrast on white. Amber was moved
> from `0.715` to `0.66` lightness to clear the contrast check. Re-run the
> validator before changing any of these five.

## Geometry

| Thing | Value |
|---|---|
| Card radius | `14px` |
| Button, input radius | `10px` |
| Icon tile radius | `11px` |
| Chip / small tile | `8–9px` |
| Pill | `999px` |
| Control height (default) | `36px` |
| Control height (small) | `32px` |
| Form field height | `40–44px` |
| Card padding | `18–20px` |
| Grid gap | `16–18px` |
| Page padding | `24px 32px` |
| Card shadow | `0 1px 2px rgb(0 0 0 / 0.04)` |

`--radius` in `globals.css` becomes `0.625rem` (10px) — unchanged — but cards
opt into `14px` via a `--radius-card` token rather than the shadcn `rounded-xl`.

## Type

**Instrument Sans** (UI), **Instrument Serif** (display), **JetBrains Mono**
(invoice numbers, tokens). Loaded via `next/font/google`, self-hosted at build.

| Role | Size / weight | Face |
|---|---|---|
| Page title | 30px / 400 / `-0.018em` | Serif |
| Login headline | 54px / 400 / `-0.018em` | Serif |
| Big number | 34px / 600 / `-0.032em`, tabular | Sans |
| Hero number (action card) | 42px / 600 / `-0.035em`, tabular | Sans |
| Section label | 17px / 600 / `-0.015em` | Sans |
| Card title | 15.5px / 600 / `-0.012em` | Sans |
| Body | 14px | Sans |
| Secondary | 13px, `--ink-2` | Sans |
| Micro | 12.5px, `--ink-3` | Sans |
| Mono | 13px | Mono |

The serif appears **once per screen at most** — the page title, or the login
headline. It is a display face; using it for section labels made them read
thin.

Every figure that can be compared column-to-column carries
`font-variant-numeric: tabular-nums`.

## Components to add

All under `src/components/ui/`, all server-safe unless noted.

| Component | Props | Notes |
|---|---|---|
| `IconTile` | `icon`, `tone`, `size` | Filled colored square, white glyph. |
| `IconTileOutline` | `icon` | White square, hairline border — used on metric cards. |
| `LetterTile` | `letter`, `tone`, `size` | Row avatars for brands/clients. |
| `DeltaChip` | `direction`, `children` | `up`/`down`/`flat`/`goodDown`/`badUp`. Colour follows meaning, arrow follows the number. |
| `StatusPill` | `status` | Replaces the current grey outline badges. Soft fill + dot. |
| `TickBar` | `pct`, `tone`, `width` | Segmented meter. |
| `SectionLabel` | `children`, `action` | Sits on the canvas, outside cards. |
| `ActionCard` | `icon`, `tone`, `title`, `value`, `unit`, `note`, `action` | Number, consequence, one button. |
| `MetricCard` | `icon`, `label`, `value`, `delta`, `vs` | Never renders a value without its baseline. |
| `TwoLineCell` | `top`, `sub`, `mono`, `align` | The table workhorse. |
| `RankedBars` | `rows` | Horizontal, ordered high→low. |
| `ColumnChart` | `data`, `yTicks`, `avg`, `color` | Client component (Recharts) — see below. |

### Charts

`ColumnChart` replaces the Recharts `AreaChart` in `revenue-chart.tsx`.

- **Columns, not an area fill.** Monthly totals are discrete; an area implies
  interpolation between months that does not exist.
- Thin bars, `radius={[4, 4, 0, 0]}`, anchored to the baseline.
- **Solid** hairline gridlines in `--line-2`. Not dashed — the current chart
  uses `strokeDasharray="4 4"`, which adds noise.
- One series → **no legend**; the card title names it.
- A `ReferenceLine` at the period average, labelled on the left where the line
  sits above the data.
- Tooltip on hover (Recharts `<Tooltip>`), never a label on every column.

`RankedBars` replaces the stacked bar + duplicate list in the brand breakdown —
the stacked bar restated what the list already said.
