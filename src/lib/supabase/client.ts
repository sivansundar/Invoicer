import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/**
 * Browser-side Supabase client. Safe to use from client components: the
 * publishable key grants nothing on its own, because every table's RLS
 * policies scope reads and writes to the caller's org.
 */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient(url, publishableKey);
}
