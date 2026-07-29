import { describe, expect, it } from "vitest";
import { validatePaidOn } from "./paid-on";

const today = new Date(2026, 6, 28); // 28 July 2026

describe("validatePaidOn", () => {
  it("accepts a date on or after the bill date and on or before today", () => {
    expect(validatePaidOn("2026-07-15", "2026-07-01", today)).toEqual({ ok: true });
  });

  it("accepts a date equal to the bill date", () => {
    expect(validatePaidOn("2026-07-01", "2026-07-01", today)).toEqual({ ok: true });
  });

  it("accepts a date equal to today", () => {
    expect(validatePaidOn("2026-07-28", "2026-07-01", today)).toEqual({ ok: true });
  });

  it("rejects a date before the bill date", () => {
    const result = validatePaidOn("2026-06-30", "2026-07-01", today);
    expect(result).toEqual({
      ok: false,
      error: "Payment date can't be before the bill date",
    });
  });

  it("rejects a date in the future", () => {
    const result = validatePaidOn("2026-07-29", "2026-07-01", today);
    expect(result).toEqual({
      ok: false,
      error: "Payment date can't be in the future",
    });
  });

  it("rejects an unparseable date", () => {
    const result = validatePaidOn("not-a-date", "2026-07-01", today);
    expect(result).toEqual({
      ok: false,
      error: "That doesn't look like a valid date",
    });
  });

  it("does not check bill-date ordering when billDate itself is unparseable", () => {
    // An unvalidated/imported record could have a garbage billDate — the
    // future check must still apply on its own.
    expect(validatePaidOn("2026-07-15", "not-a-date", today)).toEqual({ ok: true });
  });
});
