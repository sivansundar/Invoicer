"use client";

import { Calendar } from "lucide-react";
import type { Brand, Invoice } from "@/lib/types";
import { fyLabel } from "@/lib/reports";
import {
  dashboardScopeControls,
  hiddenOverdueCount,
  resolveBrandScope,
  resolveYearScope,
  type YearScope,
} from "@/lib/dashboard-scope";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex h-[38px] items-center gap-2 rounded-[11px] border bg-surface px-3.5 text-sm font-medium shadow-[var(--shadow-card)]";

/** The same pill, for the ones that respond to a click. */
const PILL_CONTROL = `${PILL} hover:bg-field dark:bg-surface dark:hover:bg-field`;

interface ScopeRowProps {
  /** The whole book, unscoped — the options and the counts are derived from it. */
  invoices: Invoice[];
  brands: Brand[];
  year: YearScope | null;
  onYearChange: (year: YearScope) => void;
}

/**
 * What the dashboard below is showing, and the two ways to change it.
 *
 * The brand segment is bound to the shared `useBrandFilter` — the same state
 * the sidebar's brand switcher writes and all four dashboard sections already
 * read. A second, dashboard-local brand selection would give the screen two
 * brand controls that can disagree, and the sections would follow the sidebar
 * while this row claimed otherwise. The financial year has no such owner, so
 * the page holds it and narrows the invoices it hands down.
 *
 * Every control here is conditional on there being something to choose: no
 * invoices means no year to state, one brand means "All brands" and that
 * brand pick the same set.
 */
export function ScopeRow({ invoices, brands, year, onYearChange }: ScopeRowProps) {
  const { brandId, setBrandId } = useBrandFilter();

  const controls = dashboardScopeControls(invoices, brands);
  const activeYear = resolveYearScope(year, controls);
  const activeBrand = resolveBrandScope(brandId, controls);
  const hidden = hiddenOverdueCount(invoices, {
    startYear: activeYear,
    brandId: activeBrand,
  });

  if (controls.years.length === 0 && controls.brandControl === "none") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-8">
      {controls.years.length > 0 &&
        (controls.yearIsChoice ? (
          <div className="relative">
            <Calendar
              className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-ink-2"
              aria-hidden="true"
            />
            <NativeSelect
              aria-label="Financial year"
              value={activeYear === null ? "all" : String(activeYear)}
              onChange={(event) =>
                onYearChange(
                  event.target.value === "all" ? "all" : Number(event.target.value)
                )
              }
              className={cn(PILL_CONTROL, "pr-9 pl-10")}
            >
              <NativeSelectOption value="all">All years</NativeSelectOption>
              {controls.years.map((option) => (
                <NativeSelectOption key={option.startYear} value={String(option.startYear)}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : (
          // One financial year on the books: a picker would offer a single
          // option that changes nothing, so the row states the scope instead.
          <span className={PILL}>
            <Calendar className="size-[17px] text-ink-2" aria-hidden="true" />
            {fyLabel(controls.years[0]!.startYear)}
          </span>
        ))}

      {controls.brandControl === "segmented" && (
        <div
          role="group"
          aria-label="Brand"
          className="inline-flex h-[38px] items-center gap-0.5 rounded-[11px] bg-field p-[3px]"
        >
          {[{ id: null, name: "All brands" }, ...controls.brands].map((option) => {
            const selected = option.id === activeBrand;
            return (
              <button
                key={option.id ?? "all"}
                type="button"
                onClick={() => setBrandId(option.id)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-8 items-center rounded-[9px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  selected
                    ? "bg-surface text-ink shadow-[var(--shadow-pill)]"
                    : "text-ink-2 hover:text-ink"
                )}
              >
                {option.name}
              </button>
            );
          })}
        </div>
      )}

      {controls.brandControl === "select" && (
        <NativeSelect
          aria-label="Brand"
          value={activeBrand ?? "all"}
          onChange={(event) =>
            setBrandId(event.target.value === "all" ? null : event.target.value)
          }
          className={cn(PILL_CONTROL, "pr-9")}
        >
          <NativeSelectOption value="all">All brands</NativeSelectOption>
          {controls.brands.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}

      {hidden > 0 && activeYear !== null && (
        <>
          <span className="flex-1" />
          {/*
            The right-hand slot the mockup fills with a "Needs action" pill.
            This is the one thing the year scope must not swallow quietly:
            money still owed from an earlier year. It appears only when that
            is true, it says how much is hidden, and it widens the scope to
            show it.
          */}
          <button
            type="button"
            onClick={() => onYearChange("all")}
            className={PILL_CONTROL}
          >
            {hidden} overdue outside {fyLabel(activeYear)}
            <span className="size-[7px] shrink-0 rounded-full bg-red" />
          </button>
        </>
      )}
    </div>
  );
}
