"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PlanState } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: PlanState = { tier: "free", renewsOn: null };

// MOCK: upgrading flips a local flag. No payment is taken and no card is stored.
//
// TODO(payment-provider): Razorpay (or whichever provider) is wired here.
// Three things are missing, not one: a checkout that actually charges,
// a webhook that sets the tier from the provider's truth rather than from a
// client-side write, and a real `renewsOn` — the date below is hardcoded, so
// the plan card's "Renews <date>" is decoration. Until then `FEATURES.billing`
// gates a Pro tier that is free and instant, and "Manage billing" in
// `plan-card.tsx` toasts instead of opening a portal.
export function usePlan() {
  const plan = useSyncExternalStore(storage.subscribe, storage.getPlanSnapshot, () => EMPTY);

  // Returns whether the write actually persisted — the one hook of the five
  // (use-brands/use-clients/use-invoices/use-templates all already do this)
  // that used to discard it, which let `pro-dialog.tsx` toast "Pro unlocked"
  // and navigate on a quota failure while `isPro` stayed false.
  const upgrade = useCallback(() => {
    // MOCK: a hardcoded renewal date. Nothing renews and nothing is charged.
    return storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" });
  }, []);

  const downgrade = useCallback(() => {
    return storage.savePlan({ tier: "free", renewsOn: null });
  }, []);

  return { plan, isPro: plan.tier === "pro", upgrade, downgrade };
}
