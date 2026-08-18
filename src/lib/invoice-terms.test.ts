import { describe, expect, it } from "vitest";
import { dueDateFromTerms, inferTerms, TERM_OPTIONS } from "./invoice-terms";

describe("dueDateFromTerms", () => {
  it("adds the offset", () => {
    expect(dueDateFromTerms("2026-08-18", 30)).toBe("2026-09-17");
    expect(dueDateFromTerms("2026-08-18", 15)).toBe("2026-09-02");
  });

  it("rolls across a month and a year boundary", () => {
    expect(dueDateFromTerms("2026-01-20", 15)).toBe("2026-02-04");
    expect(dueDateFromTerms("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("handles a leap day", () => {
    expect(dueDateFromTerms("2028-02-14", 15)).toBe("2028-02-29");
  });

  // Built from local midnight, never toISOString() — UTC would shift a stored
  // calendar date backwards a day for timezones ahead of UTC.
  it("keeps the calendar date stable regardless of timezone offset", () => {
    expect(dueDateFromTerms("2026-08-18", 0)).toBe("2026-08-18");
  });

  it("returns empty for a missing or unparseable bill date", () => {
    expect(dueDateFromTerms("", 30)).toBe("");
    expect(dueDateFromTerms("nonsense", 30)).toBe("");
  });
});

describe("inferTerms", () => {
  it("recognises each offered term", () => {
    for (const days of TERM_OPTIONS) {
      expect(inferTerms("2026-08-18", dueDateFromTerms("2026-08-18", days))).toBe(days);
    }
  });

  // A hand-picked date is not a failure — it just means the terms no longer
  // describe the pair, and the control should say Custom rather than lie.
  it("returns null for a date no term produces", () => {
    expect(inferTerms("2026-08-18", "2026-09-01")).toBeNull();
  });

  it("returns null when either date is missing or unparseable", () => {
    expect(inferTerms("", "2026-09-17")).toBeNull();
    expect(inferTerms("2026-08-18", "")).toBeNull();
    expect(inferTerms("nonsense", "2026-09-17")).toBeNull();
  });

  it("returns null when the due date precedes the bill date", () => {
    expect(inferTerms("2026-08-18", "2026-08-01")).toBeNull();
  });
});
