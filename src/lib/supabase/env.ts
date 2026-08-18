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
 */
function required(name: string): string {
  const value = process.env[name];
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
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}
