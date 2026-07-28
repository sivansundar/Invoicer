"use client";

import { useCallback, useEffect, useState } from "react";
import { PlanState } from "@/lib/types";
import * as storage from "@/lib/storage";

// MOCK: upgrading flips a local flag. No payment is taken and no card is stored.
export function usePlan() {
  const [plan, setPlan] = useState<PlanState>({ tier: "free", renewsOn: null });

  useEffect(() => {
    setPlan(storage.getPlan());
  }, []);

  const upgrade = useCallback(() => {
    const next: PlanState = { tier: "pro", renewsOn: "2026-08-27" };
    storage.savePlan(next);
    setPlan(next);
  }, []);

  const downgrade = useCallback(() => {
    const next: PlanState = { tier: "free", renewsOn: null };
    storage.savePlan(next);
    setPlan(next);
  }, []);

  return { plan, isPro: plan.tier === "pro", upgrade, downgrade };
}
