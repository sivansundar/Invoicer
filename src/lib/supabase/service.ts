import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client holding the service role key.
 *
 * This bypasses row level security entirely. It exists for exactly one kind
 * of caller: work that runs with no signed-in user and must still act across
 * orgs — the reminder sweep, and the provider webhook that records bounces.
 * Every other path in this app uses the anon key and lets RLS do the work.
 *
 * `import "server-only"` is the guard that matters. Without it, a stray
 * import from a client component would be a build-time mistake with a
 * runtime consequence: the service key inlined into a browser bundle, which
 * is total account compromise. With it, that import fails the build.
 *
 * Note the key is read as a literal `process.env.X`. This app has already
 * been bitten once by a computed `process.env[name]` lookup silently
 * yielding undefined (see `env.ts`), and while that failure mode is specific
 * to client bundles, the habit is cheap and the debugging was not.
 */
export function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. The reminder scheduler cannot reach the database."
    );
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. The reminder scheduler needs it to read across " +
        "orgs and to write send records that clients are not permitted to write."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      // No session to persist and nothing to refresh: this client is created
      // per request and thrown away. Leaving these on makes it try to write
      // storage that does not exist on a server.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
