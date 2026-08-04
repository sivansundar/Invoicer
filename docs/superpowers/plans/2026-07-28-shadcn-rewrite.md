# Invoicer v2 (shadcn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Invoicer web app to match the "Invoicer App v2 (shadcn)" design handoff — a sidebar-inset shadcn/ui application with a brand-scoped dashboard, split-pane invoice editor with live preview, and a new Follow-ups (automated email reminders) feature area.

**Architecture:** Next.js App Router, all state in `localStorage` behind `src/lib/storage.ts`. Pure logic (migration, invoice numbering, follow-up scheduling, currency grouping, chart series) lives in tested modules under `src/lib/`; React components stay presentational. A one-time schema migration (v1 → v2) runs on app boot and upgrades existing invoices in place without rewriting their invoice numbers. Brand-scoped filtering is app-wide via a React context backed by `localStorage`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (`new-york`, `neutral`, CLI v4), recharts 3.8 via shadcn `chart`, sonner (toasts), react-hook-form + zod, @react-pdf/renderer, date-fns, vitest + @testing-library/react.

**Design source:** claude.ai design project `ae5a9915-3e70-47a9-a64f-520a38882d3f`, file `Invoicer App v2 (shadcn).dc.html`. A local copy is at `/private/tmp/claude-501/.../scratchpad/design-v2.html`. Re-fetch with the `DesignSync` tool (`method: get_file`) if it is gone.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Scope boundaries (decided by the user 2026-07-28):**
- **localStorage only.** No backend, no API routes, no database.
- **No auth.** The handoff's Login screen is NOT built. Do not add a `/login` route, sign-in/sign-out UI, or a session concept. The sidebar user row renders a static local user (see Task 9).
- **Pro / billing is MOCK data.** The plan card, "Pro" pills, upsell dialog and `₹499/mo` line are a facade with no payment integration. Every mock surface carries a `// MOCK:` comment. Never describe billing as functional.
- **Follow-ups is also a facade.** Schedules, templates, the queue and reminder history persist to `localStorage`; "Send one now" appends a timestamp and shows a toast. **No email is ever sent.** Every send path carries a `// MOCK:` comment.
- **Existing localStorage invoices must survive.** Migration upgrades in place. Never clear or rewrite user data.
- **Existing invoice numbers are never rewritten.** Legacy `SC2026001` numbers stay exactly as they are (they may already be with clients). Only newly created invoices use the `SC-2026-001` format.

**Design tokens — already correct in `src/app/globals.css`, do not change these values:**
`--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`, `--accent`, `--primary`, `--destructive`, `--sidebar*` and `--radius: 0.625rem` already resolve to the exact hex values in the handoff. The only token edits allowed are the ones specified in Task 1.

**Typography:**
- Sans: **Geist**. Mono: **Geist Mono**. Both via `next/font/google`.
- Mono is used ONLY for: invoice numbers, brand prefixes, account/IFSC numbers, and template tokens. Everything else is sans.
- Every money value and every count gets `tabular-nums`.
- Page title: `text-2xl font-semibold tracking-[-0.02em]`. Body `text-sm`. Meta `text-[13px]`. Micro `text-xs`. Eyebrow `text-[11px] uppercase tracking-[0.05em]`.

**Shape:**
- Cards, shell, previews: `rounded-[14px]`. Popovers/segmented containers: `rounded-[10px]`. Buttons/inputs/nav: `rounded-lg` (8px at this radius scale — verify visually, use `rounded-[8px]` if `rounded-lg` drifts). Small buttons/inner rows: `rounded-md`. Badges/dots/toggles: `rounded-full`.
- Control heights: 36px default, 32px small, 30px tab pill, 26px token chip.
- Padding: page `p-6`, card `p-6` (dense cards `p-5`), table row `py-3 px-4`, header exactly `h-12`.

**Copy:** All user-facing strings in this plan are **verbatim from the handoff** and must be reproduced exactly, including the em dashes and the lowercase after them. Do not "improve" the copy. The voice is calm, second-person, dry-warm, never exclamatory.

**Verification for every task:** `npx tsc --noEmit` must pass (subject to the ordering constraint below), and `npm run lint` must introduce **no new problems**. Tasks touching `src/lib/` must also pass `npm test`.

**Lint baseline.** Revised during execution: 12/8 on `main` -> 9 problems at Task 14 (logo <img>) -> 6 at Task 16 -> 4 problems (1 error, 3 warnings) at Task 17 (brand-card.tsx deleted, brands/[id]/edit error cleared, one no-img-element warning added by the restored logo preview). Task 8 cleared 3 errors (storage hooks), Task 10 cleared 1 (theme toggle), and Task 14 legitimately added one `@next/next/no-img-element` warning by rendering a base64 brand logo — a rule already unsuppressed in three other files, two of which Task 22 deletes. `next/image` is not the fix for an inline data URL. Original baseline on `main` was **12 problems (8 errors, 4 warnings)** — mostly `react-hooks/set-state-in-effect` in `src/hooks/use-{brands,clients,invoices}.ts`, plus issues in files this rewrite deletes anyway (`brand-card.tsx`, `invoice-view.tsx`). "Lint passes" therefore means *the count does not go up*. Compare against the branch base with:

```bash
npm run lint 2>&1 | grep -E "problems|✖" | tail -1
```

Two consequences:
- **Task 8 must not propagate the flagged pattern into `use-templates.ts`.** See that task for the corrected hook shape.
- **Task 22 drives the count to zero.** By then most of the offending files are deleted or rewritten.

**Commits:** One commit per task, conventional-commit prefix, ending with the repo's trailer:
```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**New — pure logic (tested):**
| File | Responsibility |
|---|---|
| `src/lib/palette.ts` | The 5 brand accent colours + resolution helpers |
| `src/lib/numbering.ts` | Parse/generate invoice numbers, both legacy and v2 formats |
| `src/lib/migrate.ts` | v1 → v2 localStorage schema migration, idempotent |
| `src/lib/money.ts` | Multi-currency grouping and display strings |
| `src/lib/chart.ts` | Monthly paid-revenue series for the dashboard chart |
| `src/lib/followups.ts` | Scheduling maths, cadence copy, template token filling |
| `src/lib/seed.ts` | The three seeded email templates |

**New — state:**
| File | Responsibility |
|---|---|
| `src/hooks/use-templates.ts` | Email template CRUD over storage |
| `src/hooks/use-plan.ts` | MOCK plan tier (free/pro) |
| `src/components/brand-filter/brand-filter-provider.tsx` | App-wide selected-brand context |

**New — shell:**
| File | Responsibility |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Sidebar: switcher, quick create, nav, plan card, user row |
| `src/components/layout/brand-switcher.tsx` | Workspace-style brand dropdown |
| `src/components/layout/plan-card.tsx` | MOCK plan card |
| `src/components/layout/site-header.tsx` | 48px header: trigger, breadcrumb, theme toggle, action |
| `src/components/layout/pro-dialog.tsx` | MOCK upsell dialog |

**New — screens:**
| File | Responsibility |
|---|---|
| `src/components/dashboard/stat-cards.tsx` | The four gradient stat cards |
| `src/components/dashboard/revenue-chart.tsx` | Area chart + 12/6/3 range toggle |
| `src/components/dashboard/invoice-data-table.tsx` | Tabs, search, columns, rows, pagination |
| `src/components/invoices/invoice-preview.tsx` | The shared "what your client sees" paper preview |
| `src/components/followups/brand-followup-card.tsx` | Per-brand follow-up config card |
| `src/components/followups/template-list.tsx` | Email template rows |
| `src/components/followups/followup-queue.tsx` | "Going out next" table |
| `src/components/followups/template-form.tsx` | Template editor + email preview |
| `src/app/followups/page.tsx` | Follow-ups screen |
| `src/app/followups/templates/create/page.tsx` | New template |
| `src/app/followups/templates/[id]/page.tsx` | Edit template |
| `src/app/reports/page.tsx` | FY summary + import/export |

**Modified:** `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/lib/types.ts`, `src/lib/storage.ts`, `src/lib/utils.ts`, `src/components/layout/shell.tsx`, all `brands/`, `clients/`, `invoices/` pages and components, `src/components/invoices/invoice-pdf.tsx`, `src/components/invoices/invoice-view.tsx`, `src/components/invoices/status-badge.tsx`.

**Deleted:** `src/components/layout/header.tsx` (replaced by `site-header.tsx`), `src/components/brands/brand-card.tsx` and `src/components/clients/client-card.tsx` (replaced by the new list layouts).

---

## Task 1: Typography and token foundation

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css:10` and `:70-74`, `:104-108`

**Interfaces:**
- Produces: CSS vars `--font-sans` (Geist), `--font-mono` (Geist Mono); `--chart-1` rebound to the handoff's blue.

**Why:** The app currently renders entirely in JetBrains Mono because `globals.css:10` aliases `--font-sans` to `--font-mono` and `<body>` carries `font-mono`. The handoff is Geist sans with surgical mono.

- [ ] **Step 1: Swap the fonts in the root layout**

Replace the font import and `<body>` class in `src/app/layout.tsx`:

```tsx
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

And the body tag:

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
```

Delete the `JetBrains_Mono` import.

**The variable names must differ from the theme keys.** Inside `@theme inline`, writing `--font-sans: var(--font-sans)` is a circular reference and silently resolves to nothing — hence `--font-geist-sans`.

- [ ] **Step 2: Fix the font token alias**

In `src/app/globals.css`, line 10 currently reads `--font-sans: var(--font-mono);`. Change to:

```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
```

- [ ] **Step 3: Rebind chart-1 to the handoff blue**

The handoff's chart accent is `#2563eb` (blue-600). In `:root` replace the `--chart-1` line with:

```css
  --chart-1: oklch(0.546 0.215 262.881);
```

and in `.dark` use blue-500 (`#3b82f6`), which holds contrast against the dark card:

```css
  --chart-1: oklch(0.623 0.188 259.815);
```

Leave `--chart-2` … `--chart-5` untouched. These two values are the exact oklch conversions of `#2563eb` and `#3b82f6` — do not round them further.

- [ ] **Step 4: Verify the build compiles and fonts load**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass, no font resolution errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(design): switch to Geist type scale and blue chart accent"
```

---

## Task 2: Install the shadcn components the rewrite needs

**Files:**
- Create (via CLI): `src/components/ui/{sidebar,chart,sonner,switch,avatar,tooltip,skeleton,breadcrumb,toggle-group,toggle,native-select}.tsx`, `src/hooks/use-mobile.ts`
- Modify: `src/components/ui/sonner.tsx`

**Interfaces:**
- Produces: `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger`, `SidebarMenu*` (from `@/components/ui/sidebar`); `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig` (from `@/components/ui/chart`); `Toaster` + `toast` (sonner); `ToggleGroup`, `ToggleGroupItem`; `NativeSelect`.

- [ ] **Step 1: Add the components**

```bash
npx shadcn@latest add sidebar chart sonner switch avatar tooltip skeleton breadcrumb toggle-group native-select --yes
```

This also pulls `recharts@3.8.0`, `sonner`, `next-themes`, and creates `src/hooks/use-mobile.ts`.

- [ ] **Step 2: Detach sonner from next-themes**

The generated `src/components/ui/sonner.tsx` imports `useTheme` from `next-themes`, which this project does not use — it has its own provider at `src/components/theme/theme-provider.tsx`. Rewrite the file:

```tsx
"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
```

Then remove the now-unused dependency:

```bash
npm uninstall next-themes
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If `recharts` types conflict with React 19, run `npm ls recharts` and confirm a single `3.8.0` entry.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): add sidebar, chart, sonner and form primitives from shadcn"
```

---

## Task 3: Extend the data model to v2

**Files:**
- Create: `src/lib/palette.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces:
  - `BRAND_PALETTE: readonly string[]`, `paletteColorForIndex(i: number): string`
  - `BrandSnapshot`, `FollowupConfig`, `EmailTemplate`, `EmailTone`, `PlanState`
  - `Brand` gains `accentColor: string` and `followup: FollowupConfig`
  - `Invoice` gains `brandSnapshot: BrandSnapshot`, `clientId: string | null`, `reminders: string[]`, `followupsPaused: boolean`

**Design deviation to be aware of:** the handoff stores only `clientId` on an invoice and looks the client up live. This project already embeds an `InvoiceClient` snapshot, which is strictly better (a renamed client does not rewrite historical invoices) and is what existing user data contains. **Keep the embedded `client` as the render source of truth** and add `clientId` purely as a back-reference for the "Billed to" select and per-client stats.

- [ ] **Step 1: Create the brand accent palette**

Create `src/lib/palette.ts`:

```ts
/** Brand accent colours, in the order the handoff's swatch row presents them. */
export const BRAND_PALETTE = [
  "var(--foreground)",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
] as const;

/** Deterministic palette assignment so brands without a colour still differ. */
export function paletteColorForIndex(index: number): string {
  return BRAND_PALETTE[index % BRAND_PALETTE.length];
}
```

- [ ] **Step 2: Extend the types**

Append to `src/lib/types.ts` and amend the existing interfaces:

```ts
export type EmailTone = "Friendly" | "Direct" | "Firm";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  tone: EmailTone;
  body: string;
  createdAt: string;
}

export interface FollowupConfig {
  enabled: boolean;
  mode: "weekly" | "custom";
  /** 0 = Sunday … 6 = Saturday. Only meaningful when mode is "custom". */
  weekday: number;
  /** "HH:mm", 24-hour. */
  time: string;
  repeat: "week" | "month";
  templateId: string;
  /** 0 means "never stop". */
  stopAfter: number;
}

/**
 * Brand details frozen at invoice-creation time. Editing a brand must never
 * change an invoice that was already issued.
 */
export interface BrandSnapshot {
  name: string;
  address: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  panNumber?: string;
  logo?: string;
  invoicePrefix: string;
  accentColor: string;
  bankDetails: BankDetails;
}

/** MOCK: no payment integration exists. Persisted locally only. */
export interface PlanState {
  tier: "free" | "pro";
  renewsOn: string | null;
}
```

Add to `Brand`:

```ts
  accentColor: string;
  followup: FollowupConfig;
```

Add to `Invoice`:

```ts
  brandSnapshot: BrandSnapshot;
  /** Back-reference to a saved client. Null when no client record matches. */
  clientId: string | null;
  /** ISO "yyyy-MM-dd" dates on which a reminder was recorded. MOCK: nothing is sent. */
  reminders: string[];
  followupsPaused: boolean;
```

- [ ] **Step 3: Verify the type change surfaces every call site**

Run: `npx tsc --noEmit`
Expected: FAIL, with errors at every place that constructs a `Brand` or `Invoice` (`invoice-form.tsx`, `brand-form.tsx`, `reports.test.ts`, seed helpers). This is the expected blast radius; Tasks 4–8 and 11–18 fix it. Record the error list — it is the checklist for later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/palette.ts
git commit -m "feat(types): add brand snapshot, follow-up config and email template types"
```

---

## Task 4: Invoice numbering that understands both formats

**Files:**
- Create: `src/lib/numbering.ts`
- Create: `src/lib/numbering.test.ts`
- Modify: `src/lib/storage.ts:98-110` (remove `getNextInvoiceNumber`, re-export from the new module)

**Interfaces:**
- Consumes: `Brand`, `Invoice` from `@/lib/types`.
- Produces:
  - `parseInvoiceNumber(value: string, prefix: string): { year: number; seq: number } | null`
  - `formatInvoiceNumber(prefix: string, year: number, seq: number): string`
  - `nextInvoiceNumber(brand: Brand, invoices: Invoice[], year?: number): string`

Legacy numbers look like `SC2026001`; v2 numbers look like `SC-2026-001`. Both must parse, only v2 is generated.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/numbering.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, nextInvoiceNumber, parseInvoiceNumber } from "./numbering";
import type { Brand, Invoice } from "./types";

const brand = { id: "b1", invoicePrefix: "SC" } as Brand;

function inv(invoiceNumber: string, brandId = "b1"): Invoice {
  return { id: invoiceNumber, invoiceNumber, brandId } as Invoice;
}

describe("parseInvoiceNumber", () => {
  it("parses the legacy hyphen-free format", () => {
    expect(parseInvoiceNumber("SC2026001", "SC")).toEqual({ year: 2026, seq: 1 });
  });

  it("parses the v2 hyphenated format", () => {
    expect(parseInvoiceNumber("SC-2026-014", "SC")).toEqual({ year: 2026, seq: 14 });
  });

  it("parses sequences longer than three digits", () => {
    expect(parseInvoiceNumber("SC-2026-1041", "SC")).toEqual({ year: 2026, seq: 1041 });
  });

  it("returns null when the prefix does not match", () => {
    expect(parseInvoiceNumber("NL-2026-001", "SC")).toBeNull();
  });

  it("returns null for unparseable values", () => {
    expect(parseInvoiceNumber("SC-draft", "SC")).toBeNull();
  });

  it("treats a prefix containing regex characters literally", () => {
    expect(parseInvoiceNumber("A.B-2026-002", "A.B")).toEqual({ year: 2026, seq: 2 });
    expect(parseInvoiceNumber("AXB-2026-002", "A.B")).toBeNull();
  });
});

describe("formatInvoiceNumber", () => {
  it("pads the sequence to three digits", () => {
    expect(formatInvoiceNumber("SC", 2026, 7)).toBe("SC-2026-007");
  });

  it("does not truncate sequences past 999", () => {
    expect(formatInvoiceNumber("SC", 2026, 1041)).toBe("SC-2026-1041");
  });
});

describe("nextInvoiceNumber", () => {
  it("starts at 001 when the brand has no invoices", () => {
    expect(nextInvoiceNumber(brand, [], 2026)).toBe("SC-2026-001");
  });

  it("continues from the highest sequence across both formats", () => {
    const invoices = [inv("SC2026001"), inv("SC-2026-014"), inv("SC2026009")];
    expect(nextInvoiceNumber(brand, invoices, 2026)).toBe("SC-2026-015");
  });

  it("ignores invoices belonging to other brands", () => {
    const invoices = [inv("SC-2026-003"), inv("NL-2026-099", "b2")];
    expect(nextInvoiceNumber(brand, invoices, 2026)).toBe("SC-2026-004");
  });

  it("restarts numbering in a new year", () => {
    const invoices = [inv("SC-2026-014")];
    expect(nextInvoiceNumber(brand, invoices, 2027)).toBe("SC-2027-001");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/numbering.test.ts`
Expected: FAIL — `Failed to resolve import "./numbering"`.

- [ ] **Step 3: Implement the module**

Create `src/lib/numbering.ts`:

```ts
import type { Brand, Invoice } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Understands both the legacy hyphen-free format ("SC2026001") and the v2
 * format ("SC-2026-014"). Legacy numbers are never rewritten, so both shapes
 * coexist and both must be considered when picking the next sequence.
 */
export function parseInvoiceNumber(
  value: string,
  prefix: string
): { year: number; seq: number } | null {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-?(\\d{4})-?(\\d+)$`);
  const match = pattern.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
}

export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

export function nextInvoiceNumber(
  brand: Brand,
  invoices: Invoice[],
  year: number = new Date().getFullYear()
): string {
  const sequences = invoices
    .filter((i) => i.brandId === brand.id)
    .map((i) => parseInvoiceNumber(i.invoiceNumber, brand.invoicePrefix))
    .filter((p): p is { year: number; seq: number } => p !== null && p.year === year)
    .map((p) => p.seq);

  const next = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  return formatInvoiceNumber(brand.invoicePrefix, year, next);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/numbering.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Re-point storage at the new module**

In `src/lib/storage.ts`, delete the `getNextInvoiceNumber` function (lines 98–110) and add near the top:

```ts
export { nextInvoiceNumber } from "./numbering";
```

Then update the one caller in `src/components/invoices/invoice-form.tsx` — replace `getNextInvoiceNumber(brandId)` with `nextInvoiceNumber(brand, getInvoices())`, importing `nextInvoiceNumber` from `@/lib/storage`.

- [ ] **Step 6: Verify**

Run: `npm test && npm run lint`
Expected: numbering tests PASS. `npx tsc --noEmit` still reports the Task 3 model errors — that is expected until Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/numbering.ts src/lib/numbering.test.ts src/lib/storage.ts src/components/invoices/invoice-form.tsx
git commit -m "feat(invoices): parse legacy and v2 invoice number formats"
```

---

## Task 5: Seed data for email templates

**Files:**
- Create: `src/lib/seed.ts`

**Interfaces:**
- Produces: `SEED_TEMPLATES: EmailTemplate[]`, `DEFAULT_TEMPLATE_ID: string`, `defaultFollowupConfig(): FollowupConfig`

The three template bodies are verbatim from the handoff. `\n` line breaks are significant.

- [ ] **Step 1: Create the seed module**

Create `src/lib/seed.ts`:

```ts
import type { EmailTemplate, FollowupConfig } from "./types";

export const DEFAULT_TEMPLATE_ID = "tpl-gentle-nudge";

/** Seeded once, on first migration. Users can edit or delete them afterwards. */
export const SEED_TEMPLATES: EmailTemplate[] = [
  {
    id: DEFAULT_TEMPLATE_ID,
    name: "Gentle nudge",
    tone: "Friendly",
    subject: "A small nudge about {{invoice}}",
    body:
      "Hi {{client}},\n\n" +
      "Hope the week is treating you kindly. Just floating {{invoice}} back to the top of your inbox — {{amount}} was due on {{due_date}}.\n\n" +
      "The payment details are on the invoice, and I've attached a copy for convenience. If it's already on its way, ignore me entirely.\n\n" +
      "Warmly,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-second-reminder",
    name: "Second reminder",
    tone: "Direct",
    subject: "{{invoice}} — {{days_late}} days past due",
    body:
      "Hi {{client}},\n\n" +
      "{{invoice}} for {{amount}} is now {{days_late}} days past its due date of {{due_date}}.\n\n" +
      "Could you let me know when I can expect the transfer? Happy to re-send the invoice or share alternate payment details if that helps.\n\n" +
      "Thanks,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-final-notice",
    name: "Final notice",
    tone: "Firm",
    subject: "Final reminder: {{invoice}} ({{amount}})",
    body:
      "Hi {{client}},\n\n" +
      "This is my last automated reminder for {{invoice}}, outstanding since {{due_date}} — {{amount}}.\n\n" +
      "If payment isn't settled this week I'll follow up directly to sort out next steps. I'd much rather close this quietly.\n\n" +
      "Regards,\n{{brand}}",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export function defaultFollowupConfig(): FollowupConfig {
  return {
    enabled: true,
    mode: "weekly",
    weekday: 2,
    time: "09:00",
    repeat: "week",
    templateId: DEFAULT_TEMPLATE_ID,
    stopAfter: 4,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seed.ts
git commit -m "feat(followups): seed the three default email templates"
```

---

## Task 6: The v1 → v2 storage migration

**Files:**
- Create: `src/lib/migrate.ts`
- Create: `src/lib/migrate.test.ts`

**Interfaces:**
- Consumes: `Brand`, `Client`, `Invoice`, `EmailTemplate`, `BrandSnapshot` from `@/lib/types`; `paletteColorForIndex` from `@/lib/palette`; `SEED_TEMPLATES`, `defaultFollowupConfig` from `@/lib/seed`.
- Produces:
  - `SCHEMA_VERSION = 2`
  - `type V2Payload = { brands: Brand[]; clients: Client[]; invoices: Invoice[]; templates: EmailTemplate[] }`
  - `migrateToV2(input: { brands: unknown[]; clients: unknown[]; invoices: unknown[]; templates: unknown[] }): V2Payload`
  - `runMigration(): void` — reads/writes localStorage, no-ops if already at v2

**This is the highest-risk task in the plan.** Existing user invoices must come out the other side intact.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/migrate.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, migrateToV2, runMigration } from "./migrate";
import { DEFAULT_TEMPLATE_ID, SEED_TEMPLATES } from "./seed";
import { BRAND_PALETTE } from "./palette";

const v1Brand = {
  id: "b1",
  name: "Sivan Studio",
  address: "44, 100 Feet Rd, Indiranagar, Bengaluru 560038",
  email: "billing@sivan.studio",
  gstNumber: "29ABCDE1234F1Z5",
  invoicePrefix: "SC",
  nextInvoiceNumber: 15,
  createdAt: "2026-01-01T00:00:00.000Z",
  bankDetails: {
    accountName: "Sivan Studio",
    accountNumber: "50100234914210",
    bankName: "HDFC Bank",
    ifscCode: "HDFC0001234",
    branch: "Indiranagar",
    upiId: "sivan@okhdfc",
  },
};

const v1Client = {
  id: "c1",
  companyName: "Acme Studio",
  name: "Priya Nair",
  address: "12 Residency Rd, Bengaluru 560025",
  email: "accounts@acmestudio.in",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const v1Invoice = {
  id: "i1",
  invoiceNumber: "SC2026001",
  brandId: "b1",
  currency: "INR",
  status: "paid",
  billDate: "2026-07-10",
  dueDate: "2026-07-24",
  client: {
    companyName: "Acme Studio",
    name: "Priya Nair",
    address: "12 Residency Rd, Bengaluru 560025",
  },
  items: [{ id: "li1", description: "Website redesign", amount: 40000, tax: 18 }],
  subtotal: 40000,
  totalTax: 7200,
  total: 47200,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

function migrate(overrides: Partial<Parameters<typeof migrateToV2>[0]> = {}) {
  return migrateToV2({
    brands: [v1Brand],
    clients: [v1Client],
    invoices: [v1Invoice],
    templates: [],
    ...overrides,
  });
}

describe("migrateToV2 — brands", () => {
  it("assigns an accent colour from the palette", () => {
    expect(migrate().brands[0].accentColor).toBe(BRAND_PALETTE[0]);
  });

  it("gives every brand a default follow-up config", () => {
    const followup = migrate().brands[0].followup;
    expect(followup.enabled).toBe(true);
    expect(followup.mode).toBe("weekly");
    expect(followup.templateId).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("preserves every existing brand field", () => {
    const brand = migrate().brands[0];
    expect(brand.name).toBe("Sivan Studio");
    expect(brand.invoicePrefix).toBe("SC");
    expect(brand.bankDetails.ifscCode).toBe("HDFC0001234");
  });

  it("does not overwrite an accent colour that is already set", () => {
    const result = migrateToV2({
      brands: [{ ...v1Brand, accentColor: "#059669" }],
      clients: [],
      invoices: [],
      templates: [],
    });
    expect(result.brands[0].accentColor).toBe("#059669");
  });
});

describe("migrateToV2 — invoices", () => {
  it("never rewrites an existing invoice number", () => {
    expect(migrate().invoices[0].invoiceNumber).toBe("SC2026001");
  });

  it("preserves the embedded client snapshot", () => {
    expect(migrate().invoices[0].client.companyName).toBe("Acme Studio");
  });

  it("back-references the matching client by company name", () => {
    expect(migrate().invoices[0].clientId).toBe("c1");
  });

  it("matches company names case- and whitespace-insensitively", () => {
    const result = migrateToV2({
      brands: [v1Brand],
      clients: [{ ...v1Client, companyName: "  acme studio " }],
      invoices: [v1Invoice],
      templates: [],
    });
    expect(result.invoices[0].clientId).toBe("c1");
  });

  it("sets clientId to null when no client record matches", () => {
    const result = migrateToV2({
      brands: [v1Brand],
      clients: [],
      invoices: [v1Invoice],
      templates: [],
    });
    expect(result.invoices[0].clientId).toBeNull();
  });

  it("snapshots the brand onto the invoice", () => {
    const snapshot = migrate().invoices[0].brandSnapshot;
    expect(snapshot.name).toBe("Sivan Studio");
    expect(snapshot.invoicePrefix).toBe("SC");
    expect(snapshot.bankDetails.accountNumber).toBe("50100234914210");
  });

  it("synthesises a snapshot when the brand no longer exists", () => {
    const result = migrateToV2({
      brands: [],
      clients: [v1Client],
      invoices: [v1Invoice],
      templates: [],
    });
    const snapshot = result.invoices[0].brandSnapshot;
    expect(snapshot.name).toBe("Unknown brand");
    expect(snapshot.invoicePrefix).toBe("SC");
  });

  it("initialises the follow-up fields", () => {
    const invoice = migrate().invoices[0];
    expect(invoice.reminders).toEqual([]);
    expect(invoice.followupsPaused).toBe(false);
  });

  it("preserves totals exactly", () => {
    const invoice = migrate().invoices[0];
    expect(invoice.subtotal).toBe(40000);
    expect(invoice.totalTax).toBe(7200);
    expect(invoice.total).toBe(47200);
  });
});

describe("migrateToV2 — templates", () => {
  it("seeds the three default templates when none exist", () => {
    expect(migrate().templates).toHaveLength(SEED_TEMPLATES.length);
  });

  it("leaves existing templates untouched", () => {
    const existing = [{ ...SEED_TEMPLATES[0], name: "My nudge" }];
    const result = migrateToV2({
      brands: [],
      clients: [],
      invoices: [],
      templates: existing,
    });
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("My nudge");
  });
});

describe("migrateToV2 — idempotence", () => {
  it("produces an identical result when run on its own output", () => {
    const once = migrate();
    const twice = migrateToV2(once);
    expect(twice).toEqual(once);
  });
});

describe("runMigration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes the schema version and upgraded records", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_clients", JSON.stringify([v1Client]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));

    runMigration();

    expect(localStorage.getItem("invoicer_schema_version")).toBe(String(SCHEMA_VERSION));
    const invoices = JSON.parse(localStorage.getItem("invoicer_invoices")!);
    expect(invoices[0].clientId).toBe("c1");
    expect(invoices[0].invoiceNumber).toBe("SC2026001");
  });

  it("does nothing on a second run", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));
    runMigration();
    const after = localStorage.getItem("invoicer_invoices");
    runMigration();
    expect(localStorage.getItem("invoicer_invoices")).toBe(after);
  });

  it("seeds templates on an empty install", () => {
    runMigration();
    const templates = JSON.parse(localStorage.getItem("invoicer_templates")!);
    expect(templates).toHaveLength(SEED_TEMPLATES.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/migrate.test.ts`
Expected: FAIL — `Failed to resolve import "./migrate"`.

- [ ] **Step 3: Implement the migration**

Create `src/lib/migrate.ts`:

```ts
import { paletteColorForIndex } from "./palette";
import { SEED_TEMPLATES, defaultFollowupConfig } from "./seed";
import type { Brand, BrandSnapshot, Client, EmailTemplate, Invoice } from "./types";

export const SCHEMA_VERSION = 2;

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";
const TEMPLATES_KEY = "invoicer_templates";
const VERSION_KEY = "invoicer_schema_version";

export interface V2Payload {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
  templates: EmailTemplate[];
}

interface RawPayload {
  brands: unknown[];
  clients: unknown[];
  invoices: unknown[];
  templates: unknown[];
}

function normaliseCompanyName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Best-effort prefix recovery from a legacy invoice number ("SC2026001" -> "SC"). */
function prefixFromInvoiceNumber(invoiceNumber: string): string {
  const match = /^([^\d-]+)/.exec(invoiceNumber);
  return match ? match[1] : "INV";
}

function snapshotFromBrand(brand: Brand): BrandSnapshot {
  return {
    name: brand.name,
    address: brand.address,
    email: brand.email,
    phone: brand.phone,
    gstNumber: brand.gstNumber,
    panNumber: brand.panNumber,
    logo: brand.logo,
    invoicePrefix: brand.invoicePrefix,
    accentColor: brand.accentColor,
    bankDetails: brand.bankDetails,
  };
}

function fallbackSnapshot(invoiceNumber: string): BrandSnapshot {
  return {
    name: "Unknown brand",
    address: "",
    invoicePrefix: prefixFromInvoiceNumber(invoiceNumber),
    accentColor: paletteColorForIndex(0),
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
  };
}

export function migrateToV2(input: RawPayload): V2Payload {
  const brands = (input.brands as Brand[]).map((brand, index) => ({
    ...brand,
    accentColor: brand.accentColor ?? paletteColorForIndex(index),
    followup: brand.followup ?? defaultFollowupConfig(),
  }));

  const clients = input.clients as Client[];

  const clientsByCompany = new Map<string, string>();
  for (const client of clients) {
    clientsByCompany.set(normaliseCompanyName(client.companyName), client.id);
  }

  const brandsById = new Map(brands.map((b) => [b.id, b]));

  const invoices = (input.invoices as Invoice[]).map((invoice) => {
    const brand = brandsById.get(invoice.brandId);
    return {
      ...invoice,
      // Legacy invoice numbers are deliberately left alone — they may already
      // be in a client's inbox.
      brandSnapshot:
        invoice.brandSnapshot ??
        (brand ? snapshotFromBrand(brand) : fallbackSnapshot(invoice.invoiceNumber)),
      clientId:
        invoice.clientId ??
        clientsByCompany.get(normaliseCompanyName(invoice.client?.companyName)) ??
        null,
      reminders: invoice.reminders ?? [],
      followupsPaused: invoice.followupsPaused ?? false,
    };
  });

  const existingTemplates = input.templates as EmailTemplate[];
  const templates = existingTemplates.length > 0 ? existingTemplates : [...SEED_TEMPLATES];

  return { brands, clients, invoices, templates };
}

function read(key: string): unknown[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Runs once on app boot. Safe to call repeatedly — it exits early once the
 * stored schema version matches.
 */
export function runMigration(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(VERSION_KEY) === String(SCHEMA_VERSION)) return;

  const result = migrateToV2({
    brands: read(BRANDS_KEY),
    clients: read(CLIENTS_KEY),
    invoices: read(INVOICES_KEY),
    templates: read(TEMPLATES_KEY),
  });

  localStorage.setItem(BRANDS_KEY, JSON.stringify(result.brands));
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(result.clients));
  localStorage.setItem(INVOICES_KEY, JSON.stringify(result.invoices));
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(result.templates));
  localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/migrate.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/migrate.ts src/lib/migrate.test.ts
git commit -m "feat(storage): migrate existing invoices to the v2 schema in place"
```

---

## Task 7: Multi-currency and chart-series helpers

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`
- Create: `src/lib/chart.ts`, `src/lib/chart.test.ts`

**Interfaces:**
- Consumes: `formatCurrency` from `@/lib/utils`; `Currency`, `Invoice` from `@/lib/types`.
- Produces:
  - `groupTotalsByCurrency(invoices: Invoice[]): { currency: Currency; total: number }[]` — always INR, USD, SGD order, zero-total currencies omitted
  - `formatCurrencyGroups(groups: { currency: Currency; total: number }[]): string` — `"₹49,560 + $1,200"`, `"₹0"` when empty
  - `overflowSummary(groups): string` — `"Includes $1,200"` or `""`
  - `monthlyPaidSeries(invoices, monthCount, today): { key: string; label: string; total: number }[]`
  - `APPROX_INR_RATES: Record<Currency, number>`

- [ ] **Step 1: Write the failing money tests**

Create `src/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCurrencyGroups, groupTotalsByCurrency, overflowSummary } from "./money";
import type { Invoice } from "./types";

function inv(currency: Invoice["currency"], total: number): Invoice {
  return { currency, total } as Invoice;
}

describe("groupTotalsByCurrency", () => {
  it("sums per currency", () => {
    const result = groupTotalsByCurrency([inv("INR", 1000), inv("INR", 500)]);
    expect(result).toEqual([{ currency: "INR", total: 1500 }]);
  });

  it("orders INR, USD, SGD regardless of input order", () => {
    const result = groupTotalsByCurrency([inv("SGD", 10), inv("USD", 20), inv("INR", 30)]);
    expect(result.map((g) => g.currency)).toEqual(["INR", "USD", "SGD"]);
  });

  it("omits currencies with no invoices", () => {
    expect(groupTotalsByCurrency([inv("USD", 5)]).map((g) => g.currency)).toEqual(["USD"]);
  });

  it("defaults a missing currency to INR", () => {
    const result = groupTotalsByCurrency([{ total: 100 } as Invoice]);
    expect(result).toEqual([{ currency: "INR", total: 100 }]);
  });

  it("returns an empty array for no invoices", () => {
    expect(groupTotalsByCurrency([])).toEqual([]);
  });
});

describe("formatCurrencyGroups", () => {
  it("joins multiple currencies with a plus", () => {
    const out = formatCurrencyGroups([
      { currency: "INR", total: 49560 },
      { currency: "USD", total: 1200 },
    ]);
    expect(out).toContain("49,560");
    expect(out).toContain("1,200");
    expect(out).toContain(" + ");
  });

  it("renders a zero-rupee string when there is nothing", () => {
    expect(formatCurrencyGroups([])).toContain("0");
  });
});

describe("overflowSummary", () => {
  it("is empty for a single currency", () => {
    expect(overflowSummary([{ currency: "INR", total: 10 }])).toBe("");
  });

  it("lists every currency after the first", () => {
    const out = overflowSummary([
      { currency: "INR", total: 10 },
      { currency: "USD", total: 20 },
    ]);
    expect(out.startsWith("Includes ")).toBe(true);
    expect(out).toContain("20");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/money.test.ts`
Expected: FAIL — cannot resolve `./money`.

- [ ] **Step 3: Implement money.ts**

```ts
import type { Currency, Invoice } from "./types";
import { formatCurrency } from "./utils";

const CURRENCY_ORDER: Currency[] = ["INR", "USD", "SGD"];

export interface CurrencyGroup {
  currency: Currency;
  total: number;
}

/**
 * Currencies are never summed together — the app shows them side by side.
 */
export function groupTotalsByCurrency(invoices: Invoice[]): CurrencyGroup[] {
  const totals = new Map<Currency, number>();
  for (const invoice of invoices) {
    const currency = invoice.currency ?? "INR";
    totals.set(currency, (totals.get(currency) ?? 0) + invoice.total);
  }
  return CURRENCY_ORDER.filter((c) => totals.has(c)).map((currency) => ({
    currency,
    total: totals.get(currency)!,
  }));
}

export function formatCurrencyGroups(groups: CurrencyGroup[]): string {
  if (groups.length === 0) return formatCurrency(0, "INR");
  return groups.map((g) => formatCurrency(g.total, g.currency)).join(" + ");
}

/** Secondary line for stat cards when more than one currency is in play. */
export function overflowSummary(groups: CurrencyGroup[]): string {
  if (groups.length <= 1) return "";
  const rest = groups.slice(1).map((g) => formatCurrency(g.total, g.currency));
  return `Includes ${rest.join(" + ")}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/money.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing chart tests**

Create `src/lib/chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { monthlyPaidSeries } from "./chart";
import type { Invoice } from "./types";

function inv(billDate: string, total: number, status = "paid", currency = "INR"): Invoice {
  return { billDate, total, status, currency } as Invoice;
}

const today = new Date(2026, 6, 28); // 28 July 2026

describe("monthlyPaidSeries", () => {
  it("returns one point per requested month, oldest first", () => {
    const series = monthlyPaidSeries([], 3, today);
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("labels months with a short month name", () => {
    const series = monthlyPaidSeries([], 3, today);
    expect(series[2].label).toBe("Jul");
  });

  it("sums paid invoices into their bill month", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 40000)], 3, today);
    expect(series[2].total).toBe(40000);
  });

  it("ignores invoices that are not paid", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 40000, "sent")], 3, today);
    expect(series[2].total).toBe(0);
  });

  it("ignores months outside the window", () => {
    const series = monthlyPaidSeries([inv("2026-01-10", 999)], 3, today);
    expect(series.every((p) => p.total === 0)).toBe(true);
  });

  it("converts foreign currencies to approximate rupees", () => {
    const series = monthlyPaidSeries([inv("2026-07-10", 100, "paid", "USD")], 1, today);
    expect(series[0].total).toBe(8300);
  });

  it("spans a year boundary correctly", () => {
    const series = monthlyPaidSeries([], 3, new Date(2026, 1, 15));
    expect(series.map((p) => p.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- src/lib/chart.test.ts`
Expected: FAIL — cannot resolve `./chart`.

- [ ] **Step 7: Implement chart.ts**

```ts
import type { Currency, Invoice } from "./types";

/**
 * Approximate rates used ONLY to plot mixed-currency revenue on one axis.
 * They are a display convenience, never used for stored totals or documents.
 */
export const APPROX_INR_RATES: Record<Currency, number> = {
  INR: 1,
  USD: 83,
  SGD: 62,
};

export interface MonthPoint {
  key: string;
  label: string;
  total: number;
}

export function monthlyPaidSeries(
  invoices: Invoice[],
  monthCount: number,
  today: Date = new Date()
): MonthPoint[] {
  const months: MonthPoint[] = [];
  for (let back = monthCount - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en", { month: "short" }),
      total: 0,
    });
  }

  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const invoice of invoices) {
    if (invoice.status !== "paid") continue;
    const point = byKey.get(invoice.billDate.slice(0, 7));
    if (!point) continue;
    point.total += invoice.total * APPROX_INR_RATES[invoice.currency ?? "INR"];
  }

  return months;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npm test -- src/lib/chart.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts src/lib/chart.ts src/lib/chart.test.ts
git commit -m "feat(dashboard): add currency grouping and monthly revenue series helpers"
```

---

## Task 8: The follow-up scheduling engine

**Files:**
- Create: `src/lib/followups.ts`, `src/lib/followups.test.ts`
- Modify: `src/lib/storage.ts` (add template + plan accessors, wire `runMigration`)
- Create: `src/hooks/use-templates.ts`, `src/hooks/use-plan.ts`

**Interfaces:**
- Consumes: `Brand`, `Client`, `EmailTemplate`, `FollowupConfig`, `Invoice`, `PlanState` from `@/lib/types`; `formatCurrency` from `@/lib/utils`.
- Produces:
  - `nextSendDate(invoice: Invoice, config: FollowupConfig, today?: Date): Date | null`
  - `cadenceLabel(config: FollowupConfig): string`
  - `timeLabel(time: string): string`
  - `fillTemplate(text: string, context: Record<string, string>): string`
  - `templateContext(invoice: Invoice, brandName: string, today?: Date): Record<string, string>` — the client comes from `invoice.client`, so it is not a separate parameter
  - `TEMPLATE_TOKENS: readonly string[]`
  - Storage: `getTemplates()`, `getTemplate(id)`, `saveTemplate(t)`, `deleteTemplate(id)`, `getPlan()`, `savePlan(p)`
  - Hooks: `useTemplates()` → `{ templates, loading, save, remove, refresh }`; `usePlan()` → `{ plan, isPro, upgrade, downgrade }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/followups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cadenceLabel,
  fillTemplate,
  nextSendDate,
  templateContext,
  timeLabel,
} from "./followups";
import type { FollowupConfig, Invoice } from "./types";

const weekly: FollowupConfig = {
  enabled: true,
  mode: "weekly",
  weekday: 2,
  time: "09:00",
  repeat: "week",
  templateId: "tpl-gentle-nudge",
  stopAfter: 4,
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    status: "sent",
    dueDate: "2026-07-10",
    reminders: [],
    followupsPaused: false,
    ...overrides,
  } as Invoice;
}

/**
 * Local "yyyy-MM-dd". Never use toISOString() here — the engine builds dates
 * at local midnight, and UTC conversion shifts the day backwards for any
 * timezone ahead of UTC (this repo's author is in IST, where it would).
 */
function localDate(date: Date | null): string | null {
  if (!date) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

describe("nextSendDate", () => {
  it("schedules a week after the due date when nothing has been sent", () => {
    expect(localDate(nextSendDate(invoice(), weekly))).toBe("2026-07-17");
  });

  it("schedules a week after the last reminder", () => {
    const next = nextSendDate(invoice({ reminders: ["2026-07-17"] }), weekly);
    expect(localDate(next)).toBe("2026-07-24");
  });

  it("returns null when follow-ups are disabled for the brand", () => {
    expect(nextSendDate(invoice(), { ...weekly, enabled: false })).toBeNull();
  });

  it("returns null for a paid invoice", () => {
    expect(nextSendDate(invoice({ status: "paid" }), weekly)).toBeNull();
  });

  it("returns null for a draft invoice", () => {
    expect(nextSendDate(invoice({ status: "draft" }), weekly)).toBeNull();
  });

  it("returns null when the invoice is individually paused", () => {
    expect(nextSendDate(invoice({ followupsPaused: true }), weekly)).toBeNull();
  });

  it("returns null once the reminder cap is reached", () => {
    const inv = invoice({ reminders: ["a", "b", "c", "d"] });
    expect(nextSendDate(inv, { ...weekly, stopAfter: 4 })).toBeNull();
  });

  it("keeps scheduling when stopAfter is zero", () => {
    const inv = invoice({ reminders: ["2026-07-17", "2026-07-24"] });
    expect(nextSendDate(inv, { ...weekly, stopAfter: 0 })).not.toBeNull();
  });

  it("advances by a month when custom mode repeats monthly", () => {
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "month", weekday: 1 };
    const next = nextSendDate(invoice(), config);
    expect(next!.getMonth()).toBe(7); // August
  });

  it("lands on the configured weekday in custom mode", () => {
    const config: FollowupConfig = { ...weekly, mode: "custom", repeat: "week", weekday: 5 };
    const next = nextSendDate(invoice(), config);
    expect(next!.getDay()).toBe(5);
  });
});

describe("timeLabel", () => {
  it("renders morning times", () => {
    expect(timeLabel("09:00")).toBe("9:00 AM");
  });

  it("renders afternoon times", () => {
    expect(timeLabel("14:30")).toBe("2:30 PM");
  });

  it("renders midnight as 12 AM", () => {
    expect(timeLabel("00:15")).toBe("12:15 AM");
  });
});

describe("cadenceLabel", () => {
  it("reports when follow-ups are off", () => {
    expect(cadenceLabel({ ...weekly, enabled: false })).toBe("Follow-ups off");
  });

  it("describes the weekly cadence", () => {
    expect(cadenceLabel(weekly)).toBe("Every week after the due date · 9:00 AM");
  });

  it("describes a custom weekly cadence", () => {
    expect(cadenceLabel({ ...weekly, mode: "custom", weekday: 1 })).toBe(
      "Every week on Monday · 9:00 AM"
    );
  });

  it("describes a custom monthly cadence", () => {
    expect(cadenceLabel({ ...weekly, mode: "custom", repeat: "month", weekday: 4 })).toBe(
      "Every month on Thursday · 9:00 AM"
    );
  });
});

describe("fillTemplate", () => {
  it("replaces known tokens", () => {
    expect(fillTemplate("Hi {{client}}", { client: "Priya" })).toBe("Hi Priya");
  });

  it("leaves unknown tokens in place", () => {
    expect(fillTemplate("Hi {{nobody}}", { client: "Priya" })).toBe("Hi {{nobody}}");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(fillTemplate("Hi {{ client }}", { client: "Priya" })).toBe("Hi Priya");
  });

  it("returns an empty string for empty input", () => {
    expect(fillTemplate("", {})).toBe("");
  });
});

describe("templateContext", () => {
  const inv = invoice({
    invoiceNumber: "SC-2026-012",
    total: 34000,
    currency: "INR",
    dueDate: "2026-07-02",
    client: { companyName: "Basecamp Ltd", name: "Aisha Khan", address: "" },
  } as Partial<Invoice>);

  it("prefers the contact name over the company name", () => {
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.client).toBe("Aisha Khan");
    expect(ctx.company).toBe("Basecamp Ltd");
  });

  it("counts days late, never negative", () => {
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(Number(ctx.days_late)).toBeGreaterThan(0);
    const early = templateContext(inv, "Sivan Studio", new Date(2026, 5, 1));
    expect(early.days_late).toBe("0");
  });

  it("includes the brand name and formatted amount", () => {
    const ctx = templateContext(inv, "Sivan Studio", new Date(2026, 6, 28));
    expect(ctx.brand).toBe("Sivan Studio");
    expect(ctx.amount).toContain("34,000");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/followups.test.ts`
Expected: FAIL — cannot resolve `./followups`.

- [ ] **Step 3: Implement followups.ts**

```ts
import type { FollowupConfig, Invoice } from "./types";
import { formatCurrency } from "./utils";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const TEMPLATE_TOKENS = [
  "client",
  "company",
  "invoice",
  "amount",
  "due_date",
  "days_late",
  "brand",
] as const;

export function timeLabel(time: string): string {
  const [hours, minutes] = (time || "09:00").split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function cadenceLabel(config: FollowupConfig): string {
  if (!config.enabled) return "Follow-ups off";
  if (config.mode === "weekly") {
    return `Every week after the due date · ${timeLabel(config.time)}`;
  }
  const unit = config.repeat === "month" ? "month" : "week";
  return `Every ${unit} on ${DAYS[config.weekday]} · ${timeLabel(config.time)}`;
}

/**
 * The first scheduled slot after the last reminder (or the due date).
 * Null means nothing more will be sent for this invoice.
 */
export function nextSendDate(
  invoice: Invoice,
  config: FollowupConfig,
  today: Date = new Date()
): Date | null {
  void today;
  if (!config.enabled) return null;
  if (invoice.status === "paid" || invoice.status === "draft") return null;
  if (invoice.followupsPaused) return null;

  const sent = invoice.reminders ?? [];
  if (config.stopAfter > 0 && sent.length >= config.stopAfter) return null;

  const anchor = sent.length > 0 ? sent[sent.length - 1] : invoice.dueDate;
  const date = new Date(`${anchor}T00:00`);

  if (config.mode === "custom" && config.repeat === "month") {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setDate(date.getDate() + 7);
  }

  if (config.mode === "custom") {
    date.setDate(date.getDate() + ((config.weekday - date.getDay() + 7) % 7));
  }

  return date;
}

export function fillTemplate(text: string, context: Record<string, string>): string {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in context ? context[key] : match
  );
}

function formatLongDate(value: string): string {
  return new Date(`${value}T00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function templateContext(
  invoice: Invoice,
  brandName: string,
  today: Date = new Date()
): Record<string, string> {
  const midnight = new Date(today.toDateString());
  const daysLate = Math.max(
    Math.round((midnight.getTime() - new Date(`${invoice.dueDate}T00:00`).getTime()) / 864e5),
    0
  );

  return {
    invoice: invoice.invoiceNumber,
    client: invoice.client?.name || invoice.client?.companyName || "there",
    company: invoice.client?.companyName ?? "—",
    amount: formatCurrency(invoice.total, invoice.currency ?? "INR"),
    due_date: formatLongDate(invoice.dueDate),
    days_late: String(daysLate),
    brand: brandName,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/followups.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Add template and plan storage**

Append to `src/lib/storage.ts`:

```ts
import { EmailTemplate, PlanState } from "./types";
import { runMigration } from "./migrate";

const TEMPLATES_KEY = "invoicer_templates";
const PLAN_KEY = "invoicer_plan";

export { runMigration };

// Templates
export function getTemplates(): EmailTemplate[] {
  return getItem<EmailTemplate>(TEMPLATES_KEY);
}

export function getTemplate(id: string): EmailTemplate | null {
  return getTemplates().find((t) => t.id === id) ?? null;
}

export function saveTemplate(template: EmailTemplate): void {
  const templates = getTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  setItem(TEMPLATES_KEY, templates);
}

export function deleteTemplate(id: string): void {
  setItem(
    TEMPLATES_KEY,
    getTemplates().filter((t) => t.id !== id)
  );
}

// MOCK: plan state is local-only. There is no billing integration.
export function getPlan(): PlanState {
  if (typeof window === "undefined") return { tier: "free", renewsOn: null };
  const raw = localStorage.getItem(PLAN_KEY);
  if (!raw) return { tier: "free", renewsOn: null };
  try {
    return JSON.parse(raw) as PlanState;
  } catch {
    return { tier: "free", renewsOn: null };
  }
}

export function savePlan(plan: PlanState): void {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}
```

- [ ] **Step 6: Convert the storage hooks to `useSyncExternalStore`**

The three existing hooks (`use-brands.ts`, `use-clients.ts`, `use-invoices.ts`) each call a `setState` synchronously inside a `useEffect`, which `react-hooks/set-state-in-effect` flags as an error — 6 of the repo's 8 baseline lint errors. Copying that pattern into a fourth hook would add a 9th. Convert all four to `useSyncExternalStore`, which is the API this rule points you toward for reading an external store.

Add a tiny subscription layer to `src/lib/storage.ts` so the hooks share one notification path:

```ts
type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to local mutations and to writes from other tabs. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
```

Call `notify()` at the end of every existing `setItem` write path (`saveBrand`, `deleteBrand`, `saveClient`, `deleteClient`, `saveInvoice`, `deleteInvoice`, `saveTemplate`, `deleteTemplate`).

`useSyncExternalStore` requires a **referentially stable** snapshot — returning a fresh array every call causes an infinite render loop. Cache each collection and invalidate on write:

```ts
const EMPTY: never[] = [];
const snapshots = new Map<string, unknown[]>();

function getSnapshot<T>(key: string): T[] {
  if (!snapshots.has(key)) {
    snapshots.set(key, typeof window === "undefined" ? EMPTY : getItem<T>(key));
  }
  return snapshots.get(key) as T[];
}

function invalidate(key: string): void {
  snapshots.delete(key);
  notify();
}
```

Have `setItem` call `invalidate(key)` instead of `notify()`, and export `getBrandsSnapshot()`, `getClientsSnapshot()`, `getInvoicesSnapshot()`, `getTemplatesSnapshot()` wrapping `getSnapshot`. The `storage` event listener must also clear the cache, so route it through a handler that calls `snapshots.clear()` before notifying.

Each hook then becomes:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Invoice } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: Invoice[] = [];

export function useInvoices() {
  const invoices = useSyncExternalStore(
    storage.subscribe,
    storage.getInvoicesSnapshot,
    () => EMPTY
  );

  const save = useCallback((invoice: Invoice) => storage.saveInvoice(invoice), []);
  const remove = useCallback((id: string) => storage.deleteInvoice(id), []);

  return { invoices, loading: false, save, remove, refresh: () => {} };
}
```

Keep `loading` and `refresh` in the returned shape so existing call sites keep compiling — `loading` is now always `false` (the snapshot is synchronous) and `refresh` is a no-op, since writes notify automatically. Task 22 removes the now-dead `loading` branches from the UI.

Create `src/hooks/use-templates.ts` in exactly this shape, substituting `EmailTemplate` and `storage.getTemplatesSnapshot` / `saveTemplate` / `deleteTemplate`.

**Verify the lint count drops:** `npm run lint 2>&1 | grep -E "problems|✖" | tail -1` must report **at most 9 problems (5 errors, 4 warnings)** — down from 12/8. It must not go up under any circumstances.

**Corrected during execution.** An earlier draft of this plan claimed 6 of the 8 baseline errors came from these three hooks. Measured, it was 3. `use-plan.ts` must ALSO use `useSyncExternalStore` — this plan's first draft gave it a `useState` + `useEffect` body, reintroducing the exact anti-pattern this step removes. The five errors that remain after this task belong to files owned by later tasks and must be left alone here:

| File | Cleared by |
|---|---|
| `src/app/invoices/[id]/page.tsx` | Task 15 |
| `src/app/invoices/[id]/edit/page.tsx` | Task 16 |
| `src/app/brands/[id]/edit/page.tsx` | Task 17 |
| `src/app/clients/[id]/edit/page.tsx` | Task 18 |
| `src/components/theme/theme-toggle.tsx` | Task 10 |

Task 22 verifies the count reaches zero.

Create `src/hooks/use-plan.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { PlanState } from "@/lib/types";
import * as storage from "@/lib/storage";

// MOCK: upgrading flips a local flag. No payment is taken and no card is stored.
export function usePlan() {
  const [plan, setPlan] = useState<PlanState>({ tier: "free", renewsOn: null });

  useEffect(() => {
    setPlan(storage.getPlan());
  }, []);

  const upgrade = useCallback(() => {
    const next: PlanState = { tier: "pro", renewsOn: "2026-08-27" };
    storage.savePlan(next);
    setPlan(next);
  }, []);

  const downgrade = useCallback(() => {
    const next: PlanState = { tier: "free", renewsOn: null };
    storage.savePlan(next);
    setPlan(next);
  }, []);

  return { plan, isPro: plan.tier === "pro", upgrade, downgrade };
}
```

- [ ] **Step 7: Run the migration on boot**

In `src/components/theme/theme-provider.tsx` the app already has a client-side boot point, but migration does not belong there. Instead add it to `src/components/layout/shell.tsx` (rewritten in Task 9) — for now, add a `useEffect(() => { runMigration(); }, [])` to the existing `Shell` component and convert it to call `runMigration` from `@/lib/storage` before rendering children.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint`
Expected: all lib tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/followups.ts src/lib/followups.test.ts src/lib/storage.ts src/hooks/use-templates.ts src/hooks/use-plan.ts src/components/layout/shell.tsx
git commit -m "feat(followups): add scheduling engine, template storage and mock plan state"
```

---

## Task 9: The sidebar shell

**Files:**
- Create: `src/components/brand-filter/brand-filter-provider.tsx`
- Create: `src/components/layout/app-sidebar.tsx`
- Create: `src/components/layout/brand-switcher.tsx`
- Create: `src/components/layout/plan-card.tsx`
- Create: `src/components/layout/pro-dialog.tsx`
- Modify: `src/components/layout/shell.tsx`
- Modify: `src/app/layout.tsx` (mount `<Toaster />`)

**Interfaces:**
- Consumes: `useBrands`, `useInvoices`, `usePlan`; `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarContent`, `SidebarFooter`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` from `@/components/ui/sidebar`.
- Produces:
  - `BrandFilterProvider`, `useBrandFilter(): { brandId: string | null; setBrandId(id: string | null): void }` — `null` means "All brands", persisted at `localStorage["invoicer_brand_filter"]`
  - `<AppSidebar />`, `<ProDialog open onOpenChange />`

- [ ] **Step 1: Build the brand filter context**

Create `src/components/brand-filter/brand-filter-provider.tsx` — a client component holding `brandId` state, hydrating from `localStorage["invoicer_brand_filter"]` in a `useEffect` (never during render, to avoid a hydration mismatch — the existing `theme-provider.tsx` shows the pattern this repo already had to fix once), and writing back on change.

- [ ] **Step 2: Build the brand switcher**

`src/components/layout/brand-switcher.tsx` — a `DropdownMenu` triggered by a full-width button.

Trigger contents, left to right: a 32px `rounded-lg bg-primary text-primary-foreground` square with the brand initials (`In` for "All brands"), a two-line label block, and a `ChevronsUpDown` 16px icon in `text-muted-foreground`.

- Line 1: `text-sm font-medium` — the selected brand name, or `All brands`
- Line 2: `text-xs text-muted-foreground` — `{prefix} · {Pro|Free}` for a brand, or `{n} brands` for all

Menu contents:
- Label row: `Workspaces` (`text-xs text-muted-foreground px-2 py-1.5`)
- One item per option (All brands first), each with an 8px `rounded-full` dot in the brand's `accentColor` (`var(--muted-foreground)` for "All brands"), the name, and a right-aligned `text-xs text-muted-foreground` invoice count
- Separator
- `Add brand` with a `Plus` icon and, when not Pro, a trailing `Pro` badge. Clicking it when not Pro opens `<ProDialog />` instead of navigating.

- [ ] **Step 3: Build the plan card (MOCK)**

`src/components/layout/plan-card.tsx`, wrapped in `border rounded-xl bg-card p-3`:

```
// MOCK: no billing integration. Upgrading flips a localStorage flag.
```

- Row 1: a badge — `Pro` (`bg-foreground text-primary-foreground`) or `Free` (`bg-accent text-foreground`), then `text-xs text-muted-foreground` reading `unlimited brands` when Pro, otherwise `{n} brand` / `{n} brands`
- Row 2 (`text-xs text-muted-foreground leading-[1.45]`): Pro → `Renews 27 Aug 2026 · ₹499/mo`; Free → `No card on file. Upgrade to add more brands.`
- Button, full width, `h-8 text-[13px]`: Pro → `Manage billing` (outline, toasts `Billing portal would open here`); Free → `Upgrade to Pro` (solid, opens `<ProDialog />`)

- [ ] **Step 4: Build the Pro dialog (MOCK)**

`src/components/layout/pro-dialog.tsx` using `Dialog`, `w-[512px] max-w-[calc(100%-2rem)]`:

- Title: `Run more than one business?`
- Description: `Invoicer Pro keeps every brand's invoices, numbering and revenue neatly separate — one login, zero mess.`
- Three `Check`-icon rows (`text-sm`, `gap-2`):
  - `Unlimited brands with their own details`
  - `Per-brand revenue, trends and reports`
  - `Separate numbering — SC-001, NL-001…`
- Footer: `Maybe later` (outline, closes) and `Upgrade — ₹499/mo` (solid). The upgrade handler calls `usePlan().upgrade()`, closes, routes to `/brands/create`, and toasts `Pro unlocked for this prototype`.

- [ ] **Step 5: Build the sidebar**

`src/components/layout/app-sidebar.tsx` — `<Sidebar collapsible="icon" variant="inset">` with:

- `SidebarHeader`: `<BrandSwitcher />`, then a row with a flex-1 `Quick create` button (`h-8`, solid primary, `CirclePlus` 16px icon, links to `/invoices/create`) and a 32px square outline icon-button (`Mail` icon, `title="Inbox"`) that toasts `Inbox lives just outside this build`
- `SidebarContent`: one `SidebarMenu` with six items, each `SidebarMenuButton` with `isActive` derived from `usePathname()`:

| Label | Icon (lucide) | Href | Active when path |
|---|---|---|---|
| Dashboard | `LayoutDashboard` | `/` | `/` or `/invoices/[id]` |
| Invoices | `FileText` | `/invoices/create` | starts `/invoices` |
| Brands | `Building2` | `/brands` | starts `/brands` |
| Clients | `Users` | `/clients` | starts `/clients` |
| Follow-ups | `Bell` | `/followups` | starts `/followups` |
| Reports | `ChartNoAxesColumn` | `/reports` | starts `/reports` |

Settings is deliberately omitted — see the Deferred section at the end of this plan.

- `SidebarFooter`: `<PlanCard />` then a user row — a 32px `rounded-lg bg-accent border` initial square, a two-line name/email block (`text-sm font-medium` / `text-xs text-muted-foreground`, both `truncate`), and no sign-out control (there is no auth). Render a static local user: name `Sivan`, email `hello@sivansundar.com`.

- [ ] **Step 6: Rewrite the shell**

`src/components/layout/shell.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import { runMigration } from "@/lib/storage";

export function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    runMigration();
  }, []);

  return (
    <BrandFilterProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </BrandFilterProvider>
  );
}
```

`SiteHeader` arrives in Task 10 — create a one-line placeholder component now so this compiles, and fill it in next task.

- [ ] **Step 7: Mount the toaster**

In `src/app/layout.tsx`, inside `<ThemeProvider>`, after `{children}`, add `<Toaster />` imported from `@/components/ui/sonner`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run dev`
Expected: compiles. Load `http://localhost:3000` — the sidebar renders, the brand switcher opens, the Pro dialog opens from the plan card, and toasts appear bottom-right. The main content is an inset rounded card on a `--sidebar`-coloured page.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(shell): replace the top header with a shadcn inset sidebar"
```

---

## Task 10: The site header

**Files:**
- Create: `src/components/layout/site-header.tsx` (replacing the placeholder)
- Delete: `src/components/layout/header.tsx`
- Modify: `src/components/theme/theme-toggle.tsx`

**Interfaces:**
- Consumes: `SidebarTrigger` from `@/components/ui/sidebar`; `useTheme` from `@/components/theme/theme-provider`; `usePathname` from `next/navigation`.
- Produces: `<SiteHeader />` — a fixed 48px bar.

- [ ] **Step 1: Build the header**

`h-12 flex items-center gap-2 border-b px-6 shrink-0`:

- `<SidebarTrigger className="-ml-1.5" />`
- A 1px × 16px `bg-border` divider with `mx-2`
- `<h1 className="text-base font-medium">{crumb}</h1>` where `crumb` maps from `usePathname()`:

| Path | Crumb |
|---|---|
| `/` | `Dashboard` |
| `/invoices/create` | `New invoice` |
| `/invoices/[id]` | `Invoice` |
| `/invoices/[id]/edit` | `Edit invoice` |
| `/brands` | `Brands` |
| `/brands/create`, `/brands/[id]/edit` | `Brand details` |
| `/clients` | `Clients` |
| `/clients/create`, `/clients/[id]/edit` | `New client` |
| `/followups` | `Follow-ups` |
| `/followups/templates/*` | `Email template` |
| `/reports` | `Reports` |

- `<div className="flex-1" />`
- The theme toggle — a 32px ghost icon button showing `Sun` when dark and `Moon` when light, `title` reading `Switch to light mode` / `Switch to dark mode`
- On `/` and `/invoices/[id]` only: a ghost `New invoice` button with a 14px `Plus` icon, linking to `/invoices/create`

- [ ] **Step 2: Update the theme toggle to the new spec**

`src/components/theme/theme-toggle.tsx` must render a 32px ghost icon button matching the above. Keep its existing hydration-safe mounting behaviour — `src/components/theme/theme-toggle.test.tsx` covers it and must keep passing.

- [ ] **Step 3: Delete the old header**

```bash
git rm src/components/layout/header.tsx
```

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS, including `theme-toggle.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): add the 48px site header with breadcrumb and theme toggle"
```

---

## Task 11: Dashboard stat cards

**Files:**
- Create: `src/components/dashboard/stat-cards.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `groupTotalsByCurrency`, `formatCurrencyGroups`, `overflowSummary` from `@/lib/money`; `useBrandFilter`.
- Produces: `<StatCards invoices={Invoice[]} />`

- [ ] **Step 1: Build the card grid**

Container: `grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 px-6`.

Each card: `border rounded-[14px] bg-gradient-to-t from-black/[0.05] to-card dark:from-white/[0.06] shadow-xs p-6 flex flex-col gap-5`.

Card internals are a `grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start`:
- col 1 row 1: `text-sm text-muted-foreground` label
- col 1 row 2: `text-2xl font-semibold tracking-[-0.02em] tabular-nums leading-[1.2]` value
- col 2 spanning both rows, `justify-self-end`: an outline pill `inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs font-medium` containing a 12px `TrendingUp`/`TrendingDown` icon when applicable, then the badge text

Then a footer block, `flex flex-col gap-1.5 text-sm`: a `font-medium` line and a `text-muted-foreground` line.

- [ ] **Step 2: Wire the four cards with exact copy**

Given `filtered` (invoices already narrowed by the active brand filter):

| Card | Label | Value | Badge | Footer | Sub-footer |
|---|---|---|---|---|---|
| 1 | `Total revenue` | grouped paid totals | `{pct}%` with trend arrow (this month vs last, using `monthlyPaidSeries(filtered, 2)`) | up: `Trending up this month`, down: `Down from last month` | `overflowSummary(paid)` or `Paid invoices, all brands` |
| 2 | `Outstanding` | grouped sent+overdue | `{n} open` | open: `Awaiting payment`, none: `All settled` | `overflowSummary(pending)` or `Sent and awaiting payment` / `Nothing pending` |
| 3 | `Overdue` | grouped overdue, or `None`. Value uses `text-destructive` when non-zero | `{n} late` or `None` | `Needs a gentle nudge` / `Nothing past due` | `Oldest is {n} days late` / `Every invoice is on time` |
| 4 | `Collection rate` | `{n}%` (paid ÷ issued, where issued excludes drafts) | `{paid}/{issued}` | `≥80`: `Healthy cash flow`, else `Chase the stragglers` | `Paid vs issued, all brands` |

Guard the collection rate against a zero denominator — render `0%` when nothing has been issued.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`, then load `/` and confirm four cards render with real data and that switching brands in the sidebar changes the numbers.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/stat-cards.tsx src/app/page.tsx
git commit -m "feat(dashboard): add the four gradient stat cards"
```

---

## Task 12: Dashboard revenue chart

**Files:**
- Create: `src/components/dashboard/revenue-chart.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `monthlyPaidSeries` from `@/lib/chart`; `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig` from `@/components/ui/chart`; `Area`, `AreaChart`, `CartesianGrid`, `XAxis` from `recharts`.
- Produces: `<RevenueChart invoices={Invoice[]} />`

- [ ] **Step 1: Build the card**

Wrapper: `border rounded-[14px] bg-card shadow-xs p-6 flex flex-col gap-6`, inside a `px-6`.

Header row (`flex items-start justify-between gap-4 flex-wrap`):
- Left: `text-sm font-semibold` reading `Revenue collected`, then `text-sm text-muted-foreground mt-1` reading `₹{total} collected over the last {n} months` (rupees, `en-IN` grouping, rounded)
- Right: a `ToggleGroup type="single"` with three items — `12 months`, `6 months`, `3 months` — mapping to `12 | 6 | 3`. Style as a segmented control: `inline-flex border rounded-lg overflow-hidden`, each item `h-8 px-3 text-[13px] font-medium`, selected item `bg-accent`.

- [ ] **Step 2: Render the area chart**

```tsx
const chartConfig = {
  total: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;
```

Inside `<ChartContainer config={chartConfig} className="h-[250px] w-full">`:

```tsx
<AreaChart data={series} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
  <defs>
    <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.8} />
      <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.05} />
    </linearGradient>
  </defs>
  <CartesianGrid vertical={false} strokeDasharray="4 4" />
  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
  <Area
    dataKey="total"
    type="linear"
    fill="url(#fillTotal)"
    stroke="var(--color-total)"
    strokeWidth={2}
  />
</AreaChart>
```

The handoff draws straight segments, so `type="linear"` is correct — do not use `natural` or `monotone`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`, load `/`, switch between 12/6/3 and confirm the series length and subtitle both change, and that the chart renders in both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/revenue-chart.tsx src/app/page.tsx
git commit -m "feat(dashboard): add the interactive revenue area chart"
```

---

## Task 13: Dashboard data table

**Files:**
- Create: `src/components/dashboard/invoice-data-table.tsx`
- Modify: `src/components/invoices/status-badge.tsx`
- Delete: `src/components/invoices/invoice-table.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `<InvoiceDataTable invoices={Invoice[]} brands={Brand[]} />`

- [ ] **Step 1: Restyle the status badge to the handoff's variants**

Rewrite `src/components/invoices/status-badge.tsx` — the current blue/green/red tinted badges are replaced by shadcn variants:

```tsx
import { Badge } from "@/components/ui/badge";
import { InvoiceStatus } from "@/lib/types";

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  paid: { label: "Paid", variant: "secondary" },
  sent: { label: "Sent", variant: "outline" },
  draft: { label: "Draft", variant: "outline", className: "text-muted-foreground" },
  overdue: { label: "Overdue", variant: "destructive" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Build the toolbar**

`flex items-center gap-3 flex-wrap px-6`:
- A segmented tab bar: `inline-flex items-center h-9 bg-accent rounded-[10px] p-[3px]`, each tab `h-[30px] px-2.5 rounded-md text-[13px] font-medium` with the selected one getting `bg-card shadow-sm`. Tabs are `All`, `Paid`, `Sent`, `Draft`, `Overdue`, each followed by a count pill `bg-border rounded-full px-1.5 text-[11px] tabular-nums`.
- Spacer `flex-1`
- `<Input placeholder="Search invoices…" className="h-8 w-[180px]" />` — filters on invoice number and client company name, case-insensitive
- A `Columns` button (outline, `h-8`, `AlignLeft` + `ChevronDown` icons) opening a `DropdownMenu` of checkbox items for the optional columns `Brand`, `Due`, `Amount`, `Status`. Default all on.
- An `Add invoice` outline button linking to `/invoices/create`

Changing the tab, the search text or the page size resets the page to 1.

- [ ] **Step 3: Build the table**

`border rounded-[14px] bg-card overflow-hidden` inside a `px-6`.

Header row: `flex items-center h-10 px-4 bg-muted border-b text-sm font-medium`. Columns and flex weights, in order: Invoice `flex-[0_0_130px]`, Client `flex-[1.5]`, Brand `flex-1`, Due `flex-1`, Amount `flex-1 text-right`, Status `flex-[0_0_100px] text-right`.

Body rows: `flex items-center px-4 py-3 border-b text-sm cursor-pointer transition-colors hover:bg-muted`, routing to `/invoices/{id}` on click.
- Invoice: `font-mono text-[13px] text-muted-foreground`
- Client: `font-medium` — `invoice.client.companyName`
- Brand: a 6px `rounded-full` dot in `brandSnapshot.accentColor` then `brandSnapshot.invoicePrefix`, `text-[13px] text-muted-foreground`
- Due: `text-muted-foreground`, formatted `MMM d` via date-fns, prefixed with `Paid ` when the status is paid
- Amount: `font-medium tabular-nums`, `formatCurrency(total, currency)`
- Status: `<StatusBadge />`

Empty state, when no rows match: `p-12 text-center` with `text-sm font-medium` reading `Nothing here` and `text-sm text-muted-foreground mt-1` reading `No invoices match this filter — calm, isn't it?`

- [ ] **Step 4: Build the pagination footer**

`flex items-center gap-4 px-6 flex-wrap`:
- `flex-1 text-sm text-muted-foreground` — `Showing {from}–{to} of {n} invoices`, or `No invoices` when empty
- `Rows per page` label plus a `NativeSelect` with 10 / 20 / 50, default 10
- `Page {p} of {total}` (`total` is at least 1)
- Two 32px outline icon buttons, `ChevronLeft` / `ChevronRight`, disabled at the ends

- [ ] **Step 5: Delete the old table and rewrite the dashboard page**

```bash
git rm src/components/invoices/invoice-table.tsx
```

`src/app/page.tsx` becomes: `<Shell>` wrapping a `flex flex-col gap-6 py-6` column of `<StatCards />`, `<RevenueChart />`, `<InvoiceDataTable />`. It must apply the brand filter from `useBrandFilter()` before passing invoices down. The old `ImportExport` and `SummaryReportDialog` buttons move to `/reports` in Task 20 — remove them here.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`, then exercise every tab, the search box, the columns menu, both page buttons and each rows-per-page option.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(dashboard): add the tabbed, searchable invoice data table"
```

---

## Task 14: The shared invoice preview

**Files:**
- Create: `src/components/invoices/invoice-preview.tsx`

**Interfaces:**
- Produces: `<InvoicePreview snapshot={BrandSnapshot} client={InvoiceClient} invoiceNumber={string} billDate={string} dueDate={string} items={LineItem[]} currency={Currency} notes={string | undefined} isPaid={boolean} />`

This one component is the right-hand pane on both the invoice detail screen (Task 15) and the create/edit screen (Task 16). Build it once.

- [ ] **Step 1: Build the paper**

Root: `bg-card border rounded-[14px] shadow-lg p-8 max-w-[460px] box-border`.

- Header (`flex justify-between items-start mb-6`):
  - Left: a 32px `rounded-lg bg-primary text-primary-foreground` square with the brand initial, then `text-sm font-semibold` brand name, then `text-xs text-muted-foreground leading-[1.5] max-w-[190px]` address
  - Right (`text-right`): `text-xs text-muted-foreground tracking-[0.06em] uppercase` reading `Invoice`, then `font-mono text-sm mt-0.5` invoice number, then — only when paid — a `mt-2` `bg-accent text-foreground text-[11px] font-medium px-2.5 py-0.5 rounded-full` pill reading `Paid`
- Parties row (`flex justify-between gap-4 mb-5`): left `Billed to` with company name (`text-[13px] font-medium`) and address (`text-xs text-muted-foreground`); right, `text-right`, `Bill date` + date and `Due date` + date
- Items: a `border-t border-foreground pt-2.5` block, one row per item — `flex justify-between gap-3 py-1.5 text-[13px]`, description followed by `· {n}% tax` in `text-muted-foreground text-xs` when the tax is above zero, and the amount `tabular-nums`
- Totals: `border-t mt-2.5 pt-2.5 flex flex-col gap-1.5` — `Subtotal`, then a tax line labelled `GST {n}%` when exactly one non-zero rate is present across the items and plain `Tax` otherwise, then `Total due` at `text-base font-semibold mt-0.5`
- Payment details: only when at least one bank field is non-empty. `border rounded-lg mt-5 overflow-hidden` with a `bg-muted border-b px-3 py-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-muted-foreground` strip reading `Payment details`, then a `grid grid-cols-2 gap-px bg-border` of cells (`bg-card px-3 py-1.5 text-xs`) each holding a `text-[11px] text-muted-foreground` label over a `font-medium tabular-nums break-words` value. Fields in order, omitting empty ones: `Account name`, `Bank`, `Branch`, `Account number`, `IFSC`, `UPI ID`.
- Notes: when present, `text-xs text-muted-foreground mt-3`

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/invoices/invoice-preview.tsx
git commit -m "feat(invoices): add the shared client-facing invoice preview"
```

---

## Task 15: Invoice detail screen

**Files:**
- Modify: `src/app/invoices/[id]/page.tsx`
- Delete: `src/components/invoices/invoice-view.tsx`
- Modify: `src/components/invoices/invoice-pdf.tsx`

**Interfaces:**
- Consumes: `<InvoicePreview />`; `nextSendDate`, `cadenceLabel`, `fillTemplate`, `templateContext` from `@/lib/followups`.

- [ ] **Step 1: Restructure the page as a split pane**

`flex flex-wrap items-stretch flex-1 min-h-0`:
- Left: `flex-[1_1_460px] min-w-0 p-6 flex flex-col gap-4`
- Right: `flex-[1_1_508px] min-w-[508px] bg-muted border-l p-6` holding a header row (`Preview` in `text-sm font-medium`, `What your client sees` in `text-[13px] text-muted-foreground`) and `<InvoicePreview />` fed from `invoice.brandSnapshot`

`invoice-view.tsx` is fully replaced by the left pane plus `<InvoicePreview />` — delete it.

- [ ] **Step 2: Build the left pane header and actions**

- Back link: `All invoices` with a 14px `ChevronLeft`, `text-[13px] text-muted-foreground`, routing to `/`
- Title row: `<h1 className="text-2xl font-semibold tracking-[-0.02em] font-mono">{invoiceNumber}</h1>` then `<StatusBadge />`
- Due line, `text-sm mt-1.5`, exact copy by status:
  - `paid` → `Paid and settled — nothing to chase` (muted)
  - `draft` → `Draft — not sent to the client yet` (muted)
  - `overdue` → `{n} day|days overdue — a friendly nudge might help` (`text-destructive`)
  - `sent` → `Due in {n} day|days`, or `Past due` when the date has passed (muted)
- Action row (`flex gap-2 flex-wrap items-center`): a primary status button (`Mark as sent` for a draft, `Mark as paid` for sent/overdue, absent when paid), an outline `Download PDF` with a `Download` icon, an outline `Edit draft` only when the status is draft, and a right-aligned (`ml-auto`) ghost `Delete` in `text-muted-foreground` that turns `hover:bg-destructive/10 hover:text-destructive`

Toasts: marking sent → `{number} marked as sent`; marking paid → `{amount} in the bank — follow-ups stopped` when reminders exist, else `{amount} in the bank — nice work`; deleting → `{number} deleted`.

- [ ] **Step 3: Build the follow-ups card**

Rendered when the status is not draft, or when reminders already exist. `border rounded-[14px] bg-card p-5 flex flex-col gap-3.5`:

- Header: a 15px `Bell` icon (muted), `Follow-ups` in `text-sm font-semibold flex-1`, and a state pill — `Active` (`bg-accent`, no border) when scheduled, otherwise an outline pill reading `Stopped · paid`, `Off for this brand`, `Paused` or `Limit reached`
- A `grid grid-cols-[88px_1fr] gap-y-2 gap-x-4 text-[13px] items-baseline`: `Next send` / the resolved line, `Template` / `{name} · {cadence}`, `Subject` / the filled subject in `text-muted-foreground`

  The `Next send` value resolves in this order: the scheduled date (`Tue, 21 Jul at 9:00 AM`), else `Stopped — this invoice is paid`, `Starts once the invoice is sent`, `Paused for this invoice`, `Reminder limit reached — over to you now`, or `Follow-ups are off for {brand}`.
- History, when reminders exist: `border-t pt-3 flex flex-col gap-2`, one row per reminder — a 13px `Check` icon, `Reminder {n} sent` (muted, `flex-1`), and the date
- Actions, when the status is sent or overdue: `border-t pt-3.5 flex gap-2 items-center flex-wrap` with an outline `Pause follow-ups` / `Resume follow-ups` button, a ghost `Send one now`, and an `ml-auto text-xs text-muted-foreground` note reading `Stops the moment it's marked paid`

  `// MOCK:` `Send one now` appends `format(new Date(), "yyyy-MM-dd")` to `invoice.reminders`, saves, and toasts `"{template name}" sent to {company}`. No email is sent.

- [ ] **Step 4: Build the detail cards and line items**

A `flex gap-4 flex-wrap` row of three cards, each `border rounded-[14px] bg-card p-5`:
- `flex-[1.2_1_220px]` — `Billed to`: company (`text-sm font-medium`), contact, address
- `flex-[1_1_200px]` — `From`: a 7px accent dot plus brand name, then address, all from `brandSnapshot`
- `flex-[0_1_160px]` — `Dates`: `Billed {date}` and `Due {date}`

Then an items card, `border rounded-[14px] bg-card overflow-hidden`: a `h-10 px-4 border-b text-sm font-medium` header (`Item` / `Tax` right / `Amount` right), one row per item, and a `p-4 bg-muted` totals block with `Subtotal`, the tax line, and `Total` at `text-base font-semibold`.

A notes card follows when `invoice.notes` is set.

- [ ] **Step 5: Point the PDF at the snapshot**

`src/components/invoices/invoice-pdf.tsx` currently takes a live `brand: Brand`. Change its prop to `snapshot: BrandSnapshot` and replace every `brand.*` reference with `snapshot.*`. Update `src/app/invoices/[id]/pdf-download-button.tsx` to pass `invoice.brandSnapshot`. This is what makes "past invoices keep their original details" true in the exported document, not just on screen.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`. Open an invoice, mark it paid, pause and resume follow-ups, send one now, download the PDF, and delete a draft.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(invoices): rebuild the invoice detail screen with preview and follow-ups"
```

---

## Task 16: Create and edit invoice

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx`
- Modify: `src/components/invoices/line-items-table.tsx`
- Modify: `src/app/invoices/create/page.tsx`, `src/app/invoices/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `<InvoicePreview />`, `nextInvoiceNumber`.

- [ ] **Step 1: Restructure as a split pane**

Same two-column shape as Task 15. The right pane header reads `Live preview` / `Updates as you type`, and `<InvoicePreview />` is driven from the *live form values*, with the brand snapshot built from the currently selected brand.

- [ ] **Step 2: Rework the left pane**

Header: back link `All invoices`, `<h1>New invoice</h1>` (or `Edit invoice`), and `text-sm text-muted-foreground mt-1` reading ``Number `{previewNumber}` is assigned automatically.`` with the number itself in `font-mono`.

Form body, `flex flex-col gap-5 max-w-[580px]`:
- Row: `From (brand)` and `Billed to` selects, each `flex-[1_1_200px]`
- Row: `Bill date`, `Due date` (`flex-[1_1_150px]`), `Currency` (`flex-[1_1_120px]`, options `₹ INR`, `$ USD`, `S$ SGD`)
- `Line items` — see step 3
- `Notes` textarea, 2 rows, placeholder `Payment terms, a thank-you, anything.`
- Footer, `flex gap-2 justify-end`: outline `Save as draft`, solid `Create invoice` (or `Save changes` when editing)

Selecting a brand recomputes the preview number via `nextInvoiceNumber`. Selecting a client fills `clientId` **and** copies the client record into the embedded `client` snapshot.

- [ ] **Step 3: Rework the line items table**

`border rounded-xl bg-card overflow-hidden` with a `h-9 px-3 border-b text-[13px] text-muted-foreground` header (`Description` / `Amount` / `Tax %` / a 24px spacer).

Each row is `flex gap-2 items-center px-3 py-2 border-b`:
- Description input, `flex-[1_1_120px] h-8`, placeholder `What did you do?`
- Amount group, `flex-[0_0_120px]`, a `text-muted-foreground text-[13px]` currency symbol then a number input, `tabular-nums`
- Tax input, `flex-[0_0_64px] h-8`, `tabular-nums`
- A 24px ghost `X` icon button, `hover:text-destructive`, `title="Remove line"`

Footer button, full-width and left-aligned: a 14px `Plus` plus `Add line item`, `text-[13px] font-medium`, `hover:bg-muted`.

- [ ] **Step 4: Preserve the validation copy**

Attempting to create (not save as draft) with no line item that has both a description and a positive amount must toast `Add at least one line item first` and not save.

On success: draft → `Draft saved — finish it anytime`; created → `{number} sent to {company}`. Both route back to `/`.

Every saved invoice must carry `brandSnapshot`, `clientId`, `reminders: []` and `followupsPaused: false`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`. Create an invoice, confirm the preview updates as you type, confirm the number increments, and confirm editing a draft round-trips.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(invoices): rebuild the invoice editor with a live client preview"
```

---

## Task 17: Brands list and brand form

**Files:**
- Modify: `src/app/brands/page.tsx`, `src/app/brands/create/page.tsx`, `src/app/brands/[id]/edit/page.tsx`
- Modify: `src/components/brands/brand-form.tsx`
- Delete: `src/components/brands/brand-card.tsx`

- [ ] **Step 1: Rebuild the list**

Page: `p-6 max-w-[1000px] flex flex-col gap-5`.

Header: `<h1>Brands</h1>` and `Each business you invoice from — its own numbering, details and bank account.` on the left; a solid `New brand` button on the right carrying a `Pro` pill when the plan is free, and opening `<ProDialog />` instead of navigating in that case.

Grid: `grid grid-cols-2 gap-4`. Each card is `border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-3` containing an 8px accent dot + `text-base font-semibold` name + a `font-mono` prefix pill; the address; the bank one-liner; a follow-up state row (6px dot, `#059669` when on and `var(--border-strong)` when off, plus `cadenceLabel`); a `border-t pt-3 flex gap-6 text-[13px]` stats row (`Invoices {n}`, `Paid {grouped totals}`, and an `ml-auto font-mono text-xs` `Next: {next number}`); and two buttons — outline `View invoices` (sets the brand filter and routes to `/`) and ghost `Edit`.

Then a dashed placeholder tile: `border border-dashed border-[var(--border-strong)] rounded-[14px] min-h-[160px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground` with an 18px `Plus` and the text `Add another brand`, plus a `Pro` pill when locked.

- [ ] **Step 2: Rebuild the form**

`p-6 max-w-[660px]`. Back link `Brands`, an `<h1>` reading `New brand` or `Edit {name}`, and a subtitle:
- create → `Set it up once — every invoice from this brand fills itself in.`
- edit → `Changes apply to invoices you create from here on — past invoices keep their original details.`

Card (`border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5`):
- Row: `Brand name` (`flex-[2_1_220px]`, placeholder `e.g. Sundar Design Co`) and `Prefix` (`flex-[1_1_110px]`, placeholder `auto`, `uppercase`)
- A hint strip, `bg-muted border rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground`: create → `Invoices will look like {PREFIX}-{year}-001`; edit → `Next invoice will be {next number}`. When the prefix field is blank, derive it from the brand name — initials of each word, first three, uppercased, falling back to `INV`.
- `Accent colour`: a row of five 24px `rounded-full` swatch buttons from `BRAND_PALETTE`, the selected one ringed with `box-shadow: 0 0 0 2px var(--foreground)`
- `Address` textarea, placeholder `Street, city, PIN`
- Row: `Email` (placeholder `billing@yourbrand.in`) and `GST number` (placeholder `Optional`)
- A `border-t pt-5` section titled `Getting paid` with the subtitle `Printed at the bottom of every invoice.`, then two rows of fields: `Account name` (`As on the account`) / `Bank` (`e.g. HDFC Bank`) / `Branch` (`e.g. Indiranagar`), and `Account number` / `IFSC` / `UPI ID` (`you@okbank`)
- Footer: outline `Cancel`, solid `Create brand` / `Save changes`

When editing, a row below the card: `text-[13px] text-muted-foreground` reading `{n} invoice uses this brand` / `{n} invoices use this brand` / `No invoices use this brand yet`, and an `ml-auto` outline `Delete brand` that turns destructive on hover.

- [ ] **Step 3: Enforce the guard rails**

- Saving with a blank name toasts `Give your brand a name first` and does not save.
- Deleting a brand that has invoices toasts `Move or delete its {n} invoices first` and does not delete.
- Successful create toasts `{name} is ready — first invoice will be {PREFIX}-{year}-001`.
- Successful edit toasts `{name} updated — future invoices use the new details`.
- Successful delete toasts `{name} removed` and clears the brand filter if it pointed at the deleted brand.
- New brands are created with `defaultFollowupConfig()` and the next unused palette colour.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`. Create, edit and attempt to delete a brand that has invoices.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(brands): rebuild the brands list and form with accent colours"
```

---

## Task 18: Clients list and client form

**Files:**
- Modify: `src/app/clients/page.tsx`, `src/app/clients/create/page.tsx`, `src/app/clients/[id]/edit/page.tsx`
- Modify: `src/components/clients/client-form.tsx`
- Delete: `src/components/clients/client-card.tsx`

The handoff has no client detail page and no edit affordance. This repo has both. **Keep the edit route** — dropping working functionality is not an improvement — and reach it by clicking a row.

- [ ] **Step 1: Rebuild the list**

`p-6 max-w-[1000px] flex flex-col gap-5`. Header: `<h1>Clients</h1>`, `Saved once, auto-filled on every invoice.`, and a solid `New client` button.

Table, `border rounded-[14px] bg-card overflow-hidden`: a `h-10 px-4 border-b text-sm font-medium` header and rows `px-4 py-3 border-b text-sm cursor-pointer hover:bg-muted` routing to `/clients/{id}/edit`. Columns: Company `flex-[1.4] font-medium`, Contact `flex-1`, Email `flex-[1.3] text-[13px] text-muted-foreground truncate`, Invoices `flex-[0.6] text-right tabular-nums text-muted-foreground`, Billed `flex-1 text-right font-medium tabular-nums`.

`Invoices` counts invoices whose `clientId` matches; `Billed` is `formatCurrencyGroups(groupTotalsByCurrency(...))` over those, falling back to `—`. Show `—` for a missing contact or email.

- [ ] **Step 2: Rebuild the form**

`p-6 max-w-[660px]`, back link `Clients`, `<h1>New client</h1>`, subtitle `Add them once — they'll appear in every invoice form.`

Card fields: `Company name` (`e.g. Acme Studio`) + `Contact person` (`Optional`); `Address` textarea (`Street, city, PIN`); `Email` (`accounts@company.com`) + `Phone` (`Optional`); `GST number` (`Optional`, `max-w-[280px]`). Footer: outline `Cancel`, solid `Add client` / `Save changes`.

Blank company name toasts `Who are we billing? Add a company name`. Success toasts `{company} added to your client book`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`. Add a client, confirm it appears in the invoice form's `Billed to` select, and edit it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(clients): rebuild the clients list and form"
```

---

## Task 19: Follow-ups screen

**Files:**
- Create: `src/app/followups/page.tsx`
- Create: `src/components/followups/brand-followup-card.tsx`
- Create: `src/components/followups/template-list.tsx`
- Create: `src/components/followups/followup-queue.tsx`

**Interfaces:**
- Consumes: `nextSendDate`, `cadenceLabel`, `timeLabel` from `@/lib/followups`; `useTemplates`, `useBrands`, `useInvoices`.

`// MOCK:` at the top of `page.tsx` — nothing here sends email.

- [ ] **Step 1: Build the page frame**

`p-6 max-w-[1000px] flex flex-col gap-5`. Header: `<h1>Follow-ups</h1>`, `Let each brand chase its own unpaid invoices by email. Paid invoices drop out on their own.`, and an outline `New template` button routing to `/followups/templates/create`.

A summary card, `border rounded-[14px] bg-gradient-to-t from-black/[0.05] to-card dark:from-white/[0.06] shadow-xs px-6 py-5`:
- `text-sm font-medium`: `{n} invoice|invoices queued · next goes out {Tue, 21 Jul}`, or `Nothing queued — every unpaid invoice is either paused or out of reminders` when the queue is empty
- `text-[13px] text-muted-foreground mt-0.5`: `{n} of {m} brand|brands chasing automatically`

The queue is every sent/overdue invoice with a non-null `nextSendDate`, sorted ascending.

- [ ] **Step 2: Build the per-brand card**

Section heading `Per brand` (`text-sm font-semibold`), then one `<BrandFollowupCard />` per brand: `border rounded-[14px] bg-card shadow-sm px-6 py-5 flex flex-col gap-4.5`.

Header row: an 8px accent dot, `text-[15px] font-semibold` name, a state pill (`Active` with `bg-accent` / `Paused` outline), a spacer, and a `<Switch />` on the right.

When off: `text-[13px] text-muted-foreground` reading `Nothing goes out from this brand. Turn it on to schedule polite reminders after the due date.`

When on:
- `When to send` — a segmented `ToggleGroup` with `Every week` and `Pick a day & time`, styled like the dashboard tabs, plus `cadenceLabel(config)` beneath in `text-xs text-muted-foreground`
- `Email template` — a `NativeSelect` of templates plus an outline `Edit` button routing to that template's editor
- Only in custom mode, a `bg-muted border rounded-[10px] px-4 py-3.5 flex gap-4 flex-wrap` group: `Day` (weekday select), `Time` (`type="time"`), `Repeat` (`Every week` / `Every month`)
- `Stop reminders` — a select with `after 2 reminders`, `after 3 reminders`, `after 4 reminders`, `after 6 reminders`, `never — keep nudging` (value `0`), beside the note `Reminders always stop the moment an invoice is marked paid — this is just the cap for the stubborn ones.`
- A `border-t pt-3.5 flex gap-5 text-[13px] text-muted-foreground` stats row: `{a} of {b} unpaid invoices queued` (or `No unpaid invoices right now`) and `{n} reminders sent so far` (or `Nothing sent yet`)

Every control writes straight through to the brand record via `useBrands().save`.

- [ ] **Step 3: Build the template list**

Heading `Email templates` with the subtitle `Write once, attach to any brand. Placeholders fill themselves in per invoice.`

`border rounded-[14px] bg-card overflow-hidden`; each row `flex items-center gap-4 px-4 py-3.5 border-b cursor-pointer hover:bg-muted` routing to the editor: name (`text-sm font-medium`) over usage (`text-xs text-muted-foreground` — the attached brand names joined by ` · `, or `Not attached to a brand`), the subject (`flex-[1.6] text-[13px] text-muted-foreground truncate`), a tone pill (outline, `text-xs`), and a 15px `ChevronRight`.

- [ ] **Step 4: Build the queue table**

Rendered only when the queue is non-empty. Heading `Going out next`. Header row: Invoice `flex-[0_0_130px]`, Client `flex-[1.3]`, Reminder `flex-1`, Scheduled `flex-[1.3]`, and a `flex-[0_0_90px]` action column.

Rows show up to six entries: the number in `font-mono text-[13px]` preceded by a 6px accent dot (clicking routes to the invoice), the company, `Reminder {n} · {template name}`, the scheduled slot (`Tue, 21 Jul, 9:00 AM`), and a ghost `Pause` button that sets `followupsPaused` and toasts `Follow-ups paused for {number}`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`. Toggle a brand off and on, switch to custom mode, change the cap, and pause a queued invoice.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(followups): add the follow-ups screen with per-brand scheduling"
```

---

## Task 20: Email template editor

**Files:**
- Create: `src/components/followups/template-form.tsx`
- Create: `src/app/followups/templates/create/page.tsx`
- Create: `src/app/followups/templates/[id]/page.tsx`

- [ ] **Step 1: Build the split pane**

Left `flex-[1_1_520px] min-w-[400px] p-6 flex flex-col gap-5`; right `flex-[1_1_440px] min-w-[400px] bg-muted border-l p-6`.

Left header: back link `Follow-ups`, `<h1>` reading `New email template` or `Edit "{name}"`, and a subtitle — `Used by {brands joined by ·}`, `Not attached to a brand yet`, or `Attach it to a brand after saving`.

- [ ] **Step 2: Build the form**

Card fields:
- Row: `Template name` (`flex-[1.2_1_200px]`, placeholder `e.g. Gentle nudge`) and `Tone` — a segmented `ToggleGroup` of `Friendly`, `Direct`, `Firm`
- `Subject line`, placeholder `A small nudge about your invoice`
- `Message` textarea, 10 rows, `leading-[1.6]`
- Below it, an insert row: `text-xs text-muted-foreground` reading `Insert`, then one chip per token from `TEMPLATE_TOKENS` — `h-[26px] px-2.5 bg-muted border rounded-full font-mono text-[11px] text-muted-foreground`, appending `{{token}}` to the body on click
- Footer: outline `Cancel`, solid `Create template` / `Save template`

New templates start with the body `Hi {{client}},\n\n\n\nThanks,\n{{brand}}` and tone `Friendly`.

- [ ] **Step 3: Build the email preview**

Right pane header: `Preview` and `Preview uses {invoice number}` — pick the sample invoice as the first overdue invoice, else the first sent invoice, else the first invoice of any kind. When there are no invoices at all, render the raw template text with the tokens unreplaced and label it `Preview uses sample data`.

The mock: `bg-card border rounded-[14px] shadow-lg overflow-hidden` with
- a `px-5 py-4 border-b flex flex-col gap-1.5` head — the filled subject in `text-[15px] font-semibold tracking-[-0.01em] leading-[1.35]` (falling back to `Subject line`), and `{brand} → {company}` in `text-xs text-muted-foreground`
- a `p-5 text-[13px] leading-[1.7] whitespace-pre-wrap` body (falling back to `Your message goes here.`)
- a `px-5 py-3.5 border-t bg-muted flex items-center gap-2` footer with a 14px `FileText` icon and `A PDF of the invoice is attached automatically`

- [ ] **Step 4: Enforce the guard rails**

- A blank name or subject toasts `A template needs a name and a subject line` and does not save.
- Deleting a template attached to a brand toasts `Swap the template on {brand names joined by " and "} first` and does not delete.
- Success toasts `{name} updated` or `{name} created — attach it to a brand`; deleting toasts `{name} deleted`.
- The delete control only appears when editing: `text-[13px] text-muted-foreground` usage line plus an `ml-auto` outline `Delete template` that turns destructive on hover.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`. Create a template, insert tokens, confirm the preview fills them from a real invoice, attach it to a brand, then confirm deleting it is blocked.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(followups): add the email template editor with live preview"
```

---

## Task 21: Reports screen

**Files:**
- Create: `src/app/reports/page.tsx`
- Modify: `src/components/reports/summary-report-dialog.tsx`
- Modify: `src/components/invoices/import-export.tsx`

The FY summary report and import/export are existing, working features that the handoff omits. They move here rather than being lost.

- [ ] **Step 1: Build the page**

`p-6 max-w-[1000px] flex flex-col gap-5`. Header: `<h1>Reports</h1>` and the subtitle `Financial-year summaries, and a way to move your data in and out.`

Two cards, `border rounded-[14px] bg-card shadow-sm p-6`:
- `Financial year summary` — subtitle `Every invoice in a financial year, grouped by currency, exportable as a PDF.` Hosts the existing `<SummaryReportDialog />` trigger.
- `Import and export` — subtitle `Take your invoices, brands and clients with you — or bring them back.` Hosts the existing `<ImportExport />` controls.

- [ ] **Step 2: Make import/export migration-aware**

`src/components/invoices/import-export.tsx` writes invoices straight to storage. Imported records may be in the v1 shape, so after writing, call `runMigration()` — but `runMigration` exits early once the version key is set. Add an exported `forceMigration()` to `src/lib/migrate.ts` that clears the version key and then runs, and call that from the import path. Add `forceMigration` to the existing import at the top of `src/lib/migrate.test.ts`, then add this test inside the `describe("runMigration")` block so it inherits the `localStorage.clear()` in `beforeEach`:

```ts
it("forceMigration re-runs even when the version key is current", () => {
  localStorage.setItem("invoicer_schema_version", String(SCHEMA_VERSION));
  localStorage.setItem("invoicer_brands", JSON.stringify([v1Brand]));
  localStorage.setItem("invoicer_invoices", JSON.stringify([v1Invoice]));
  forceMigration();
  const invoices = JSON.parse(localStorage.getItem("invoicer_invoices")!);
  expect(invoices[0].brandSnapshot).toBeDefined();
});
```

Run it, watch it fail, implement `forceMigration`, watch it pass.

- [ ] **Step 3: Update the report tests for the v2 model**

`src/lib/reports.test.ts` constructs `Invoice` objects. Add the new required fields to its fixtures so `npx tsc --noEmit` is clean. Do not change any assertions — the report logic itself is unchanged.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`. Generate an FY report PDF and round-trip an export/import.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reports): move FY summary and import/export to a Reports screen"
```

---

## Task 22: Cleanup and full verification

**Files:**
- Delete: any file left orphaned by Tasks 9–21
- Modify: `README.md`

- [ ] **Step 1: Find dead code**

Run:
```bash
npx knip 2>/dev/null || grep -rL "import" src/components --include="*.tsx" -l
```
Then grep each suspect for imports across `src/`. Expected orphans: `src/components/layout/header.tsx`, `src/components/brands/brand-card.tsx`, `src/components/clients/client-card.tsx`, `src/components/invoices/invoice-table.tsx`, `src/components/invoices/invoice-view.tsx`. Delete any that are genuinely unreferenced.

- [ ] **Step 2: Confirm no `Brand` is used where a snapshot belongs**

Run: `grep -rn "brand\." src/components/invoices/`
Expected: every hit reads from `brandSnapshot`, not a live brand record. Fix any stragglers.

- [ ] **Step 3: Confirm every mock is labelled**

Run: `grep -rn "MOCK:" src/`
Expected: hits in `use-plan.ts`, `storage.ts` (plan accessors), `plan-card.tsx`, `pro-dialog.tsx`, `followups/page.tsx`, and the "Send one now" handler in `src/app/invoices/[id]/page.tsx`. Add any that are missing.

- [ ] **Step 4: Full verification**

Run each, and paste the actual output into the task notes:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all four pass with zero errors.

- [ ] **Step 5: Manual smoke test**

With `npm run dev`, walk the whole app in both light and dark mode and at a 1280px and a 1024px viewport:
dashboard (all four tabs, search, pagination) → open an invoice → mark it paid → create an invoice → brands → edit a brand → clients → follow-ups → edit a template → reports → generate a PDF.

Then verify migration against real data: before starting, copy your existing `localStorage` to a scratch file; after, confirm every pre-existing invoice still lists with its original number and totals.

- [ ] **Step 6: Update the README**

Document the new IA (six nav destinations), the v2 schema and its migration, and — explicitly — that auth, billing and email sending are **not implemented**.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove dead components and document the v2 architecture"
```

---

## Deferred — deliberately not built

Record these so they are not mistaken for oversights:

1. **Auth / login screen.** In the handoff, omitted by decision. There is no user, session or sign-out anywhere.
2. **Billing.** The plan card, Pro pills, upsell dialog and `₹499/mo` line are mock. `usePlan().upgrade()` flips a `localStorage` flag. No payment provider, no card, no invoice for the subscription itself.
3. **Actual email sending.** Follow-ups schedule, queue and record reminders locally. Nothing is transmitted. A real implementation needs a backend with a scheduler and a mail provider.
4. **Settings screen.** The handoff shows a muted, non-functional Settings nav item ("Settings live just outside this prototype"). Omitted; Reports takes its place in the nav.
5. **Client detail page.** The handoff stubs it ("Client detail is next on the roadmap"). This build keeps the existing client *edit* route instead.
6. **Legacy invoice number backfill.** Existing `SC2026001` numbers stay as they are, by design.

---

## Self-review notes

- **Spec coverage:** every screen in the handoff maps to a task — Login (deferred, documented), Dashboard (11–13), Invoice detail (15), Create invoice (16), Brands + form (17), Clients + form (18), Follow-ups (19), Template form (20), Pro dialog (9), Toast (9). Foundations in 1–2, data model in 3–8, plus Reports (21) which the handoff omits.
- **Type consistency:** `brandSnapshot`, `clientId`, `reminders`, `followupsPaused`, `accentColor`, `followup` are named identically in Tasks 3, 6, 13, 15, 16, 17 and 22. `nextInvoiceNumber` (Task 4) is the only number generator and is used in Tasks 16 and 17. `nextSendDate`/`cadenceLabel`/`timeLabel`/`fillTemplate`/`templateContext` (Task 8) are consumed in Tasks 15, 19 and 20 under exactly those names.
- **Known ordering constraint:** `npx tsc --noEmit` is expected to fail from Task 3 until Task 8 completes the storage/hook layer, and some UI call sites stay broken until their own task. Only Task 22 asserts a fully clean typecheck. Do not "fix" intermediate type errors by weakening the model.
