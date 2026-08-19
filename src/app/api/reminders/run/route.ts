import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createReminderStore } from "@/lib/reminder-store";
import { runReminderSweep } from "@/lib/reminder-run";

/**
 * The reminder sweep, as an endpoint.
 *
 * pg_cron owns the schedule and calls this hourly (see the cron migration).
 * The work runs here rather than inside a Supabase Edge Function for one
 * reason: the sequencing rules, the composition and the send layer are
 * ~600 lines of tested TypeScript that a Deno function cannot import — it
 * resolves modules differently and this app's `@/` aliases and
 * extension-less imports do not survive the trip. The alternative was a
 * second implementation of `dueReminder` in Deno, and two implementations of
 * "which reminder is owed today" is precisely the drift every other decision
 * in this feature has been made to avoid.
 *
 * What that costs: the sweep needs the web app to be up. Scheduling itself
 * still lives next to the data, so a deploy that is briefly down delays
 * reminders rather than losing them — the next hourly run picks up exactly
 * the same owed stages, because what is owed is derived from dates and
 * history, never from a queue that could drain while nobody was listening.
 */

export const dynamic = "force-dynamic";
// Sending a few hundred messages sequentially outlasts the default budget.
export const maxDuration = 300;

/**
 * Constant-time comparison, so a caller cannot learn the secret one byte at a
 * time from how long a rejection takes. Length is compared first because
 * `timingSafeEqual` throws on a mismatch — that check leaks only the length,
 * which is not the secret.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.REMINDER_CRON_SECRET;
  if (!expected) {
    // Refusing to run is the safe direction. An unauthenticated endpoint that
    // sends mail on demand is worse than reminders that do not go out.
    return NextResponse.json(
      { error: "REMINDER_CRON_SECRET is not set, so this endpoint is disabled" },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not set, so nothing can be sent" },
      { status: 503 }
    );
  }

  const fromEmail = process.env.REMINDER_FROM_EMAIL ?? "notifications@invoicer.app";

  try {
    const store = createReminderStore(createServiceSupabase());
    const report = await runReminderSweep({
      store,
      identity: { fromEmail },
      apiKey,
    });
    return NextResponse.json(report);
  } catch (err) {
    // A thrown error here means the sweep could not start at all — the
    // database was unreachable, or configuration is wrong. Individual invoice
    // failures never reach this point; they are recorded on their own rows.
    const detail = err instanceof Error ? err.message : "Unknown error";
    console.error("[reminders] sweep failed to run:", detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
