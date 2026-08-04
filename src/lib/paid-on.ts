export type PaidOnValidation = { ok: true } | { ok: false; error: string };

/**
 * Validates a `paidOn` edit before it is written. Rejects and explains
 * rather than silently clamping — a `paidOn` before `billDate` is
 * incoherent (paid before invoiced) and silently misplaces revenue in
 * `monthlyPaidSeries`; a future `paidOn` cannot be true yet either.
 *
 * Built as local midnight (`${value}T00:00`), matching every other date
 * anchor in this codebase (`dates.ts`, `dashboard.ts`, `invoice-detail.ts`)
 * — never `toISOString()`, which has already been the source of a
 * timezone-shifted-a-day bug class here.
 */
export function validatePaidOn(
  value: string,
  billDate: string,
  today: Date = new Date()
): PaidOnValidation {
  const paid = new Date(`${value}T00:00`);
  if (Number.isNaN(paid.getTime())) {
    return { ok: false, error: "That doesn't look like a valid date" };
  }

  const bill = new Date(`${billDate}T00:00`);
  if (!Number.isNaN(bill.getTime()) && paid.getTime() < bill.getTime()) {
    return { ok: false, error: "Payment date can't be before the bill date" };
  }

  const midnight = new Date(today.toDateString());
  if (paid.getTime() > midnight.getTime()) {
    return { ok: false, error: "Payment date can't be in the future" };
  }

  return { ok: true };
}
