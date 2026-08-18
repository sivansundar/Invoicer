import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/", "/pricing", "/privacy", "/terms", "/login", "/callback"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * Redirects to `url` while carrying over any cookies `setAll` already wrote
 * onto `base`.
 *
 * `NextResponse.redirect()` builds a brand-new response, so returning it
 * directly drops a session cookie refreshed (or cleared) during the claims
 * check on exactly the requests that redirect. Supabase rotates refresh
 * tokens on use: the browser keeps sending the now-invalidated old one, so a
 * dropped refresh here corrupts the *next* refresh attempt, not just this
 * one. Same failure mode the module comment below warns about, one branch
 * lower than it looks.
 */
function redirectWithCookies(url: URL, base: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  for (const cookie of base.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

/**
 * Refreshes the auth cookies on every request and redirects anonymous
 * visitors away from app routes.
 *
 * Two rules this function exists to honour:
 *
 * 1. Nothing may run between `createServerClient` and the claims check. An
 *    await in between can let a stale token through.
 * 2. The returned response MUST be the one the cookie handler mutated. Build
 *    a fresh `NextResponse` and you drop the refreshed cookies, which logs
 *    the user out at random once the old token expires. This applies to the
 *    redirect branches too — see `redirectWithCookies` above.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getClaims() verifies the JWT locally against the JWKS endpoint rather
  // than calling the auth server on every request. Never getSession() here.
  //
  // Deliberately fail closed: a thrown error (e.g. a JWKS fetch failure)
  // is treated as "no claims" rather than left to propagate, which would
  // 500 every route the matcher covers. Failing closed is the correct
  // default for an auth gate, and it cannot loop — `/login` is public. Do
  // not "fix" this into fail-open.
  let claims: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims ?? null;
  } catch (error) {
    // Interim operational signal until Sentry wiring (Phase 3): without
    // this, a JWKS outage silently logs out every visitor and nothing
    // records why. Still fails closed — see the comment above.
    console.warn("[proxy] getClaims() failed; treating request as anonymous", {
      pathname: request.nextUrl.pathname,
      error,
    });
    claims = null;
  }

  const { pathname } = request.nextUrl;

  if (!claims && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithCookies(url, supabaseResponse);
  }

  if (claims && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}
