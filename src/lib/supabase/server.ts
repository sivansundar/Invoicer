import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to the request's cookie store.
 *
 * `setAll` throws when called from a Server Component (which cannot write
 * cookies). That is expected and safe to swallow: `proxy.ts` refreshes the
 * session on every request, so the cookies are already current by the time
 * a Server Component reads them.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component — proxy.ts already refreshed these.
          }
        },
      },
    }
  );
}
