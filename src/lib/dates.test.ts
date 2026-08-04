import { describe, expect, it } from "vitest";
import { formatStoredDate } from "./dates";

describe("formatStoredDate", () => {
  it("returns the default fallback for an empty string", () => {
    expect(formatStoredDate("", "dd MMM yyyy")).toBe("—");
  });

  it("returns the default fallback for undefined", () => {
    expect(formatStoredDate(undefined, "dd MMM yyyy")).toBe("—");
  });

  it("returns a custom fallback when given one", () => {
    expect(formatStoredDate("", "dd MMM yyyy", "Date not set")).toBe("Date not set");
    expect(formatStoredDate(undefined, "dd MMM yyyy", "Date not set")).toBe("Date not set");
  });

  it("formats a well-formed stored date", () => {
    expect(formatStoredDate("2026-07-28", "dd MMM yyyy")).toBe("28 Jul 2026");
  });

  it("formats using whatever date-fns pattern is passed", () => {
    expect(formatStoredDate("2026-07-28", "MMM d")).toBe("Jul 28");
  });

  it("returns the fallback for a malformed-but-non-empty date rather than throwing", () => {
    expect(() => formatStoredDate("2026-13-45", "dd MMM yyyy")).not.toThrow();
    expect(formatStoredDate("2026-13-45", "dd MMM yyyy")).toBe("—");
  });

  it("returns the fallback for outright garbage rather than throwing", () => {
    expect(() => formatStoredDate("not-a-date", "dd MMM yyyy")).not.toThrow();
    expect(formatStoredDate("not-a-date", "dd MMM yyyy")).toBe("—");
  });
});
