"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PlanState } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: PlanState = { tier: "free", renewsOn: null };

// MOCK: upgrading flips a local flag. No payment is taken and no card is stored.
export function usePlan() {
  const plan = useSyncExternalStore(storage.subscribe, storage.getPlanSnapshot, () => EMPTY);

  // Returns whether the write actually persisted — the one hook of the five
  // (use-brands/use-clients/use-invoices/use-templates all already do this)
  // that used to discard it, which let `pro-dialog.tsx` toast "Pro unlocked"
  // and navigate on a quota failure while `isPro` stayed false.
  const upgrade = useCallback(() => {
    return storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" });
  }, []);

  const downgrade = useCallback(() => {
    return storage.savePlan({ tier: "free", renewsOn: null });
  }, []);

  return { plan, isPro: plan.tier === "pro", upgrade, downgrade };
}
