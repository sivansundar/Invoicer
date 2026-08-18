/**
 * Payment terms, as the shortcut between a bill date and a due date.
 *
 * The form used to ask for both dates independently, so every invoice meant
 * typing a date and then doing "plus 30 days" in your head. Terms make the
 * common case one click and leave the due date editable — picking a date by
 * hand simply means the terms no longer describe it, which `inferTerms`
 * reports as `null` so the control can show "Custom" rather than lie.
 */

/** The offsets offered as one-click choices. */
export const TERM_OPTIONS = [15, 30, 45] as const;

export type TermDays = (typeof TERM_OPTIONS)[number];

/**
 * `billDate` plus `days`, as a stored "yyyy-MM-dd" string.
 *
 * Built from local midnight and formatted by hand rather than via
 * `toISOString()`: this app has already been bitten once by UTC shifting a
 * stored calendar date backwards a day for timezones ahead of UTC.
 *
 * Returns "" for a missing or unparseable bill date — there is nothing to
 * add to, and a fabricated due date would be worse than an empty field.
 */
export function dueDateFromTerms(billDate: string, days: number): string {
  if (!billDate) return "";
  const start = new Date(`${billDate}T00:00`);
  if (Number.isNaN(start.getTime())) return "";

  const due = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/**
 * Which term the pair of dates describes, or `null` when none of them does —
 * including when either date is missing or unparseable, and when the due date
 * precedes the bill date.
 */
export function inferTerms(billDate: string, dueDate: string): TermDays | null {
  if (!billDate || !dueDate) return null;
  return TERM_OPTIONS.find((days) => dueDateFromTerms(billDate, days) === dueDate) ?? null;
}
