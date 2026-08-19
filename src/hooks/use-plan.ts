"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlanState } from "@/lib/types";
import { queryKeys } from "@/lib/query-client";
import * as storage from "@/lib/storage";

const FREE: PlanState = { tier: "free", renewsOn: null };

/**
 * The org's plan, and the email allowance that comes with it.
 *
 * MOCK: still no payment provider. What changed is where the tier lives —
 * `org_billing` in Postgres rather than `localStorage`, where a browser could
 * grant itself Pro. That was harmless while the tier gated nothing but an
 * upsell dialog and stopped being harmless the moment the email quota began
 * depending on it. `org_billing` has no client write policy at all; upgrading
 * goes through a server route.
 *
 * TODO(payment-provider): Razorpay (or whichever provider) is wired here.
 * Three things are still missing, not one: a checkout that actually charges,
 * a webhook that sets the tier from the provider's truth rather than from a
 * request this app trusts, and a real `renewsOn`. Until then `FEATURES.billing`
 * gates a Pro tier that is free and instant, and "Manage billing" in
 * `plan-card.tsx` toasts instead of opening a portal.
 */
export function usePlan() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.plan,
    queryFn: storage.getPlan,
  });

  const { data: quota } = useQuery({
    queryKey: queryKeys.emailQuota,
    queryFn: storage.getEmailQuota,
  });

  // One-time cleanup of the key the localStorage version left behind. A stale
  // entry claiming Pro would sit in browsers forever meaning nothing, and
  // mislead the next person who goes looking for why a tier looks wrong.
  useEffect(() => {
    storage.clearLegacyPlanKey();
  }, []);

  const setTier = useMutation({
    mutationFn: storage.setPlanTier,
    onSuccess: (plan) => {
      queryClient.setQueryData(queryKeys.plan, plan);
      // The allowance moves with the tier, so a stale quota would show the
      // old ceiling immediately after an upgrade — the one moment somebody is
      // definitely looking at it.
      queryClient.invalidateQueries({ queryKey: queryKeys.emailQuota });
    },
  });

  const upgrade = useCallback(() => setTier.mutateAsync("pro"), [setTier]);
  const downgrade = useCallback(() => setTier.mutateAsync("free"), [setTier]);

  const plan = data ?? FREE;
  return {
    plan,
    isPro: plan.tier === "pro",
    loading: isPending,
    /** Null until loaded, or when the workspace has no billing row. */
    quota: quota ?? null,
    upgrade,
    downgrade,
  };
}
