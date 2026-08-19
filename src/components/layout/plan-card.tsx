"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useBrands } from "@/hooks/use-brands";
import { usePlan } from "@/hooks/use-plan";
import { ProDialog } from "./pro-dialog";

// MOCK: no billing integration. Upgrading flips a localStorage flag.
export function PlanCard() {
  const { brands } = useBrands();
  const { plan, isPro, quota } = usePlan();
  const [proDialogOpen, setProDialogOpen] = useState(false);

  return (
    <Panel className="p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-[22px] items-center rounded-full px-2.5 text-[12.5px] font-medium",
            isPro ? "bg-ink text-canvas" : "bg-field text-ink-2"
          )}
        >
          {isPro ? "Pro" : "Free"}
        </span>
        <span className="text-[12.5px] text-ink-3 tabular-nums">
          {isPro
            ? "unlimited brands"
            : `${brands.length} ${brands.length === 1 ? "brand" : "brands"}`}
        </span>
      </div>

      <p className="mt-2 text-[12.5px] leading-[1.45] text-ink-2">
        {isPro && plan.renewsOn
          ? `Renews ${format(new Date(plan.renewsOn), "d MMM yyyy")} · ₹499/mo`
          : "No card on file. Upgrade to add more brands."}
      </p>

      {/*
        The email allowance, from the same `email_quota()` the send trigger
        enforces — so this figure and the one that blocks a reminder cannot
        disagree. Absent while loading, and for a workspace with no billing
        row: "0 of 0" would read as a measured zero rather than as unknown.
      */}
      {quota && (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between text-[12.5px] tabular-nums">
            <span className="text-ink-2">Reminder emails</span>
            <span className={quota.overLimit ? "font-medium text-red" : "text-ink-2"}>
              {quota.used} of {quota.monthlyLimit}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-field">
            <div
              className={cn("h-full rounded-full", quota.overLimit ? "bg-red" : "bg-blue")}
              style={{
                width: `${Math.min(100, quota.monthlyLimit === 0 ? 100 : (quota.used / quota.monthlyLimit) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">
            {quota.overLimit
              ? "Limit reached — reminders are recorded but not sent until next month."
              : `${quota.remaining} left this month`}
          </p>
        </div>
      )}

      {isPro ? (
        <Button
          variant="outline"
          className="mt-2.5 h-8 w-full rounded-[10px] text-[13px]"
          onClick={() => toast("Billing portal would open here")}
        >
          Manage billing
        </Button>
      ) : (
        <Button
          className="mt-2.5 h-8 w-full rounded-[10px] text-[13px]"
          onClick={() => setProDialogOpen(true)}
        >
          Upgrade to Pro
        </Button>
      )}

      <ProDialog open={proDialogOpen} onOpenChange={setProDialogOpen} />
    </Panel>
  );
}
