/**
 * The one place the Supabase environment is read.
 *
 * `process.env.X!` compiles fine and then fails deep inside `@supabase/ssr`
 * with a message that names neither the variable nor the file it belongs
 * in. `src/test/integration/helpers.ts` has validated its own environment
 * since Phase 1; this brings the app to the same standard.
 *
 * Only `NEXT_PUBLIC_`-prefixed names appear here, and deliberately so — the
 * service-role key must never be reachable from application code.
 *
 * ## Why these reads are written out longhand
 *
 * Every read below is a LITERAL `process.env.NEXT_PUBLIC_…` member access,
 * and it has to stay that way.
 *
 * There is no `process.env` in the browser. Next.js makes `NEXT_PUBLIC_*`
 * work on the client by *statically substituting* each literal occurrence
 * with its value at build time. That substitution is a textual match: a
 * computed read like `process.env[name]` is not analysable, so it is never
 * replaced, and in the browser bundle it evaluates to `undefined` no matter
 * what `.env.local` contains.
 *
 * This module is imported by `client.ts`, which runs in the browser. When
 * these reads were `process.env[name]`, `createClient()` threw
 * "NEXT_PUBLIC_SUPABASE_URL is not set" on every sign-in attempt against a
 * perfectly good `.env.local` — while `server.ts` and `proxy.ts`, which run
 * in Node where `process.env` is real, worked fine. The unit tests passed
 * for the same reason: they run in Node too, so nothing below the browser
 * boundary could see the failure.
 *
 * `env.test.ts` asserts the longhand form is still here, because that is the
 * only layer of this codebase that can.
 */

/**
 * Read inside the call rather than captured at module load: a module-level
 * snapshot would be evaluated once at import, which is both wrong for a
 * long-lived server process and untestable — `env.test.ts` sets
 * `process.env` per case and expects the next call to reflect it.
 */
function readEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  // Empty-string, not just undefined: a shell exporting an unset variable
  // produces "", which a `!` assertion accepts and the SDK does not.
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.local.example to .env.local and fill it in — ` +
        `\`supabase status\` prints both values for the local stack.`,
    );
  }
  return value;
}

export function supabaseEnv(): { url: string; publishableKey: string } {
  const env = readEnv();
  return {
    url: required(env, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}
