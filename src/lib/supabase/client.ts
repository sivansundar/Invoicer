import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Safe to use from client components: the
 * publishable key grants nothing on its own, because every table's RLS
 * policies scope reads and writes to the caller's org.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
