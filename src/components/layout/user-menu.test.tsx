import { describe, expect, it } from "vitest";
import { initialFor } from "./user-menu";

describe("initialFor", () => {
  it("uses the first letter of the email, uppercased", () => {
    expect(initialFor("hello@sivansundar.com")).toBe("H");
  });

  it("falls back to a neutral glyph when the email is missing", () => {
    expect(initialFor(undefined)).toBe("?");
  });

  it("ignores leading whitespace", () => {
    expect(initialFor("  ada@example.com")).toBe("A");
  });
});
