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

  /**
   * The cron sweep authenticates with a bearer secret rather than a session,
   * because pg_cron calls it with nobody logged in. Before this it was caught
   * by the gate and answered with a 307 to /login — the token was never read,
   * and no reminder could ever be sent on a schedule.
   */
  it("lets the cron sweep through so its own bearer check can run", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const response = await updateSession(makeRequest("/api/reminders/run"));

    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  /**
   * The other two routes act as a specific signed-in user, so they must keep
   * the session gate. A blanket /api exemption would opt them — and every
   * future route — out of authentication silently.
   */
  it("still gates the routes that act as a signed-in user", async () => {
    for (const pathname of ["/api/reminders/chase", "/api/billing/tier"]) {
      getClaims.mockResolvedValue({ data: { claims: null } });

      const response = await updateSession(makeRequest(pathname));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    }
  });
});
