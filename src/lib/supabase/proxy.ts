import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/", "/pricing", "/privacy", "/terms", "/login", "/callback"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
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
 *    the user out at random once the old token expires.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  if (!claims && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (claims && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
