import { describe, expect, it } from "vitest";
import { safeNextPath } from "./route";

/**
 * `safeNextPath` is the only thing standing between an attacker-controlled
 * `next` query param and an open redirect. See the comment on the function
 * for why the check alone isn't the whole story — these cases pin the
 * behaviour so a future change to either the guard or the caller's URL
 * construction gets caught here first.
 */
describe("safeNextPath", () => {
  it("passes an ordinary in-app path through unchanged", () => {
    expect(safeNextPath("/brands")).toBe("/brands");
  });

  it("rejects a protocol-relative URL (network-path reference)", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
  });

  it("rejects an absolute URL with an explicit scheme", () => {
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
  });

  it("passes a backslash-prefixed path through unchanged — safe only because the caller concatenates rather than URL-resolves", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/\\evil.com");
  });

  it("defaults to /dashboard when next is an empty string", () => {
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it("defaults to /dashboard when next is missing", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
