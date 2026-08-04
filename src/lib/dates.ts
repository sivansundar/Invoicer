import { format } from "date-fns";

/**
 * Formats a stored "yyyy-MM-dd" date, returning `fallback` when the value is
 * missing or unparseable. Stored dates are unvalidated — `import-export.tsx`
 * parses arbitrary JSON and casts it straight to `Invoice[]` with no runtime
 * validation of any field — so every display path must tolerate garbage
 * rather than trust it. `new Date("bad-value")` produces an `Invalid Date`,
 * which is a *truthy* object, so a plain `if (value)` guard is not enough:
 * it still reaches date-fns `format()`, which throws
 * `RangeError: Invalid time value` with no error boundary anywhere in this
 * app to catch it.
 *
 * Built as local midnight (`${value}T00:00`), matching every other date
 * anchor already in this codebase (`followups.ts`, `dashboard.ts`,
 * `invoice-detail.ts`). Never build this with `toISOString()` — this app has
 * already been bitten once by UTC shifting a stored calendar date backwards a
 * day for timezones ahead of UTC.
 */
export function formatStoredDate(
  value: string | undefined,
  pattern: string,
  fallback = "—"
): string {
  if (!value) return fallback;
  const date = new Date(`${value}T00:00`);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern);
}
