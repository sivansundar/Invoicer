import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/types";

/**
 * The vocabulary the redesigned screens are built from. Specified in
 * docs/redesign/01-design-system.md; every value here matches the mockups.
 *
 * These are deliberately plain and server-safe — nothing here reaches for
 * state or effects, so pages can stay server components where they already
 * are. The chart lives in its own client module.
 */

/** The five accent slots. The categorical order is blue → amber → violet → green. */
export type Tone = "blue" | "amber" | "violet" | "green" | "red" | "ink";

const TILE_BG: Record<Tone, string> = {
  blue: "bg-blue",
  amber: "bg-amber",
  violet: "bg-violet",
  green: "bg-green",
  red: "bg-red",
  ink: "bg-ink",
};

type IconType = ComponentType<{ className?: string }>;

/** Filled colored square with a white glyph — heads an action card. */
export function IconTile({
  icon: Icon,
  tone,
  className,
}: {
  icon: IconType;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[11px]",
        TILE_BG[tone],
        className
      )}
    >
      <Icon className="size-5 text-white" />
    </span>
  );
}

/** White square with a hairline — heads a metric card, where colour would be noise. */
export function IconTileOutline({ icon: Icon }: { icon: IconType }) {
  return (
    <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border bg-surface">
      <Icon className="size-[17px] text-ink-2" />
    </span>
  );
}

/** Row avatar for a brand or client. */
export function LetterTile({
  letter,
  tone,
  size = 34,
  className,
}: {
  letter: string;
  tone: Tone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[9px] font-semibold text-white",
        TILE_BG[tone],
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.41) }}
    >
      {letter}
    </span>
  );
}

/**
 * A metric never appears without what it is being compared against, and the
 * colour follows the *meaning* while the arrow follows the *number* — a
 * falling days-to-pay is an improvement, so it is a green down-arrow.
 */
export type DeltaDirection = "up" | "down" | "flat" | "goodDown" | "badUp";

const DELTA: Record<DeltaDirection, { fg: string; bg: string; icon: IconType }> = {
  up: { fg: "text-green", bg: "bg-green-soft", icon: ArrowUp },
  down: { fg: "text-red", bg: "bg-red-soft", icon: ArrowDown },
  flat: { fg: "text-ink-3", bg: "bg-field", icon: Minus },
  goodDown: { fg: "text-green", bg: "bg-green-soft", icon: ArrowDown },
  badUp: { fg: "text-red", bg: "bg-red-soft", icon: ArrowUp },
};

export function DeltaChip({
  direction,
  children,
}: {
  direction: DeltaDirection;
  children: ReactNode;
}) {
  const { fg, bg, icon: Icon } = DELTA[direction];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums", fg)}>
      <span className={cn("inline-flex size-[17px] items-center justify-center rounded-full", bg)}>
        <Icon className="size-[11px]" />
      </span>
      {children}
    </span>
  );
}

const STATUS: Record<InvoiceStatus, { label: string; fg: string; bg: string; dot: string }> = {
  paid: { label: "Paid", fg: "text-green", bg: "bg-green-soft", dot: "bg-green" },
  sent: { label: "Sent", fg: "text-blue", bg: "bg-blue-soft", dot: "bg-blue" },
  overdue: { label: "Overdue", fg: "text-red", bg: "bg-red-soft", dot: "bg-red" },
  draft: { label: "Draft", fg: "text-ink-2", bg: "bg-field", dot: "bg-ink-3" },
};

/** Soft fill plus a dot, replacing the grey outline badges. */
export function StatusPill({ status }: { status: InvoiceStatus }) {
  const { label, fg, bg, dot } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap",
        bg,
        fg
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

const BAR_FG: Record<"green" | "amber" | "red" | "blue", string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  blue: "var(--blue)",
};

/**
 * Segmented meter. The dashes are a texture on the track, not gridlines —
 * they read as discrete units (reminders sent, budget consumed) rather than
 * as a continuous fill.
 */
export function TickBar({
  pct,
  tone = "green",
  width = 96,
}: {
  pct: number;
  tone?: keyof typeof BAR_FG;
  width?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className="inline-block h-[9px] rounded-[2px] align-middle"
      style={{
        width,
        background: "repeating-linear-gradient(to right, var(--line) 0 3px, transparent 3px 5px)",
      }}
    >
      <span
        className="block h-[9px] rounded-[2px]"
        style={{
          width: `${clamped}%`,
          background: `repeating-linear-gradient(to right, ${BAR_FG[tone]} 0 3px, transparent 3px 5px)`,
        }}
      />
    </span>
  );
}

/** Sits directly on the canvas, outside any card, with an optional right-hand link. */
export function SectionLabel({
  children,
  href,
  action,
}: {
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{children}</h2>
      {action &&
        (href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink"
          >
            {action}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2">
            {action}
            <ArrowRight className="size-3.5" />
          </span>
        ))}
    </div>
  );
}

/** The card shell everything else sits in. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("rounded-card border bg-surface shadow-[var(--shadow-card)]", className)}
    >
      {children}
    </div>
  );
}

/**
 * A number, the consequence of that number, and exactly one button. This is
 * what replaces the dashboard's four unactionable stat cards.
 */
export function ActionCard({
  icon,
  tone,
  title,
  value,
  unit,
  noteIcon: NoteIcon,
  note,
  action,
}: {
  icon: IconType;
  tone: Tone;
  title: string;
  value: string;
  unit: string;
  noteIcon: IconType;
  note: string;
  action: ReactNode;
}) {
  return (
    <Panel className="flex-1 px-5 pt-[18px] pb-[19px]">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} tone={tone} />
        <span className="text-[15.5px] font-semibold tracking-[-0.012em]">{title}</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[42px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
          {value}
        </span>
        <span className="self-end pb-1 text-sm text-ink-3">{unit}</span>
        <span className="flex-1" />
        {action}
      </div>
      <div className="mt-[13px] flex items-center gap-2">
        <NoteIcon className="size-[15px] shrink-0 text-ink-3" />
        <span className="text-[13.5px] text-ink-2">{note}</span>
      </div>
    </Panel>
  );
}

/** Carries its comparison baseline; `vs` is not optional by design. */
export function MetricCard({
  icon,
  label,
  value,
  delta,
  vs,
}: {
  icon: IconType;
  label: string;
  value: string;
  delta?: ReactNode;
  vs: string;
}) {
  return (
    <Panel className="min-w-0 flex-1 px-[18px] pt-4 pb-[17px]">
      <div className="flex items-center gap-[11px]">
        <IconTileOutline icon={icon} />
        <span className="text-[14.5px] font-medium whitespace-nowrap">{label}</span>
      </div>
      <div className="mt-3.5 text-[34px] leading-[1.1] font-semibold tracking-[-0.032em] tabular-nums">
        {value}
      </div>
      <div className="mt-[11px] flex items-center gap-3">
        {delta}
        <span className="flex-1" />
        <span className="text-[13px] text-ink-3 tabular-nums">{vs}</span>
      </div>
    </Panel>
  );
}

/**
 * Value on top, the thing you would otherwise have to open the invoice to
 * learn underneath. The workhorse of every table on the redesigned screens.
 */
export function TwoLineCell({
  top,
  sub,
  mono = false,
  align = "left",
  subClassName,
}: {
  top: ReactNode;
  sub: ReactNode;
  mono?: boolean;
  align?: "left" | "right";
  subClassName?: string;
}) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div
        className={cn(
          "font-medium tabular-nums",
          mono ? "font-mono text-[13px] text-ink-2" : "text-sm"
        )}
      >
        {top}
      </div>
      <div className={cn("mt-0.5 text-[12.5px] text-ink-3", subClassName)}>{sub}</div>
    </div>
  );
}

export interface RankedBarRow {
  name: string;
  /** Raw magnitude, used for bar length. */
  value: number;
  /** Preformatted for display — these can be different currencies. */
  display: string;
  pct: number;
  tone: Tone;
}

/**
 * Horizontal bars ordered high→low. Replaces a stacked bar plus a list that
 * restated it: one form, and bar length answers "who earns most" directly.
 */
export function RankedBars({ rows }: { rows: RankedBarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <div key={row.name} className="px-1.5 pt-2.5 pb-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className={cn("size-[9px] shrink-0 self-center rounded-[2px]", TILE_BG[row.tone])} />
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <span className="text-sm font-semibold tabular-nums">{row.display}</span>
            <span className="w-10 text-right text-[12.5px] text-ink-3 tabular-nums">{row.pct}%</span>
          </div>
          <div className="mt-2 ml-[19px] h-[7px] rounded-[3px] bg-line-2">
            <div
              className={cn("h-[7px] rounded-[3px]", TILE_BG[row.tone])}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
