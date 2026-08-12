import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Only ever redirect within this origin — an attacker-controlled `next`
 * would otherwise turn this into an open redirect: `//evil.com` is a
 * network-path reference that a URL parser resolves as absolute, so
 * rejecting anything starting with `//` (not just requiring a leading
 * `/`) is required.
 *
 * That string check is only half of what keeps this safe today. The
 * caller below builds the final redirect by string concatenation
 * (`` `${origin}${safeNext}` ``), which never triggers relative-URL
 * resolution — the returned path is just appended after an
 * already-fixed authority. If that construction is ever "simplified" to
 * `new URL(next, origin)`, relative resolution kicks in and `//evil.com`
 * (or the backslash variant `/\evil.com`, which special-scheme URL
 * parsers treat the same as `//` when resolving a *relative* reference)
 * is honoured as a network-path reference again — silently reopening
 * the redirect with this guard still sitting there looking correct. Do
 * not change the concatenation without re-checking this function.
 */
export function safeNextPath(next: string | null): string {
  if (!next) return "/dashboard";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/**
 * Both magic link and OAuth land here with a `code` to exchange for a
 * session. `next` carries the path the user originally asked for, so a
 * deep link survives the round trip through the auth provider.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const safeNext = safeNextPath(searchParams.get("next"));
  const nextQuery = `&next=${encodeURIComponent(safeNext)}`;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code${nextQuery}`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed${nextQuery}`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
