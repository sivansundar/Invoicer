import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

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
  const { url, publishableKey } = supabaseEnv();

  return createServerClient(
    url,
    publishableKey,
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
