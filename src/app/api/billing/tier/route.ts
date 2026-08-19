import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * Change the signed-in user's plan tier.
 *
 * MOCK: this is the upgrade button, and it charges nothing. It exists as a
 * server route rather than a client write for one reason — `org_billing` has
 * no client write policy, because a tier a browser can set is a tier every
 * browser can grant itself, and the email quota now depends on it.
 *
 * TODO(payment-provider): when a provider is wired, this route stops being
 * the way a tier changes. The provider's webhook becomes the writer, this
 * becomes "start a checkout", and the difference matters: a tier set from a
 * request this app merely trusts is not the same as a tier set from a payment
 * that actually cleared.
 *
 * The caller's identity comes from their own session, never from the request
 * body — the org is resolved from `auth.uid()`, so there is nothing to pass
 * that would upgrade somebody else's workspace.
 */

const TIERS = new Set(["free", "pro"]);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let tier: unknown;
  try {
    ({ tier } = (await request.json()) as { tier?: unknown });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (typeof tier !== "string" || !TIERS.has(tier)) {
    return NextResponse.json({ error: "Unknown plan tier" }, { status: 400 });
  }

  // Read the membership as the user, so the org comes from their session.
  const { data: membership, error: membershipError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace for this account" }, { status: 403 });
  }

  // Write as the service role: the table is deliberately read-only to clients.
  const service = createServiceSupabase();
  const { data, error } = await service
    .from("org_billing")
    .update({
      tier,
      // MOCK: a hardcoded renewal a month out. Nothing renews and nothing is
      // charged; a real provider supplies this from the subscription.
      renews_on:
        tier === "pro"
          ? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", membership.org_id)
    .select("tier, renews_on")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tier: data.tier as string,
    renewsOn: (data.renews_on as string | null) ?? null,
  });
}
