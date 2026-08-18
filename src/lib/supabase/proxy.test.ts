import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Stubs `createServerClient` so `setAll` fires exactly as it would when
 * Supabase silently refreshes an expiring session — the scenario the
 * cookie-dropping bug this file guards against only shows up under.
 * `getClaims` is a separate mock so each test can control whether the
 * visitor looks anonymous or authenticated.
 */
const getClaims = vi.fn();

// createServerClient is mocked below, so these values are never read by an
// SDK — they only need to satisfy supabaseEnv()'s presence check.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: { name: string; value: string; options?: Record<string, unknown> }[]
        ) => void;
      };
    }
  ) => {
    options.cookies.setAll([
      { name: "sb-access-token", value: "refreshed-access-token", options: { path: "/" } },
      { name: "sb-refresh-token", value: "refreshed-refresh-token", options: { path: "/" } },
    ]);
    return { auth: { getClaims } };
  },
}));

const { updateSession } = await import("./proxy");

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("updateSession — refreshed cookies survive every branch", () => {
  beforeEach(() => {
    getClaims.mockReset();
  });

  it("carries refreshed cookies through the anonymous redirect to /login", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const response = await updateSession(makeRequest("/brands"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=%2Fbrands");
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed-access-token");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("refreshed-refresh-token");
  });

  it("carries refreshed cookies through the authenticated redirect to /dashboard", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const response = await updateSession(makeRequest("/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed-access-token");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("refreshed-refresh-token");
  });

  it("carries refreshed cookies through the pass-through path", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const response = await updateSession(makeRequest("/brands"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed-access-token");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("refreshed-refresh-token");
  });

  it("fails closed and still redirects when getClaims() throws", async () => {
    getClaims.mockRejectedValue(new Error("JWKS fetch failed"));

    const response = await updateSession(makeRequest("/brands"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=%2Fbrands");
  });

  it("does not redirect a public path when anonymous, even on error", async () => {
    getClaims.mockRejectedValue(new Error("JWKS fetch failed"));

    const response = await updateSession(makeRequest("/pricing"));

    expect(response.headers.get("location")).toBeNull();
  });
});
