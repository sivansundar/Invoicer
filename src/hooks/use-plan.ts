"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PlanState } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: PlanState = { tier: "free", renewsOn: null };

// MOCK: upgrading flips a local flag. No payment is taken and no card is stored.
export function usePlan() {
  const plan = useSyncExternalStore(storage.subscribe, storage.getPlanSnapshot, () => EMPTY);

  const upgrade = useCallback(() => {
    storage.savePlan({ tier: "pro", renewsOn: "2026-08-27" });
  }, []);

  const downgrade = useCallback(() => {
    storage.savePlan({ tier: "free", renewsOn: null });
  }, []);

  return { plan, isPro: plan.tier === "pro", upgrade, downgrade };
}
