import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !PUBLISHABLE_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Integration tests need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and " +
      "SUPABASE_SERVICE_ROLE_KEY in .env.test.local. Run `supabase status -o env`."
  );
}

/** Bypasses RLS. Test setup only — never import this from application code. */
export const admin = createClient(URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "integration-test-password-1";

export function uniqueEmail(): string {
  return `test-${randomUUID()}@example.test`;
}

export interface TestUser {
  client: SupabaseClient;
  userId: string;
  orgId: string;
  email: string;
}

/**
 * Creates a confirmed user, signs them in, and returns a client carrying
 * their access token — so every query it makes is subject to RLS exactly as
 * the real app's queries are.
 *
 * Tests never reset the database. Each user is unique, so suites are
 * independent without needing a clean slate.
 */
export async function makeUser(): Promise<TestUser> {
  const email = uniqueEmail();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const client = createClient(URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  const { data: membership, error: orgError } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .single();
  if (orgError) throw orgError;

  return { client, userId, orgId: membership.org_id, email };
}
