"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrands } from "@/hooks/use-brands";
import { usePlan } from "@/hooks/use-plan";
import { ProDialog } from "./pro-dialog";

// MOCK: no billing integration. Upgrading flips a localStorage flag.
export function PlanCard() {
  const { brands } = useBrands();
  const { plan, isPro } = usePlan();
  const [proDialogOpen, setProDialogOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <Badge className={isPro ? "bg-foreground text-primary-foreground" : "bg-accent text-foreground"}>
          {isPro ? "Pro" : "Free"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {isPro
            ? "unlimited brands"
            : `${brands.length} ${brands.length === 1 ? "brand" : "brands"}`}
        </span>
      </div>

      <p className="mt-2 text-xs leading-[1.45] text-muted-foreground">
        {isPro && plan.renewsOn
          ? `Renews ${format(new Date(plan.renewsOn), "d MMM yyyy")} · ₹499/mo`
          : "No card on file. Upgrade to add more brands."}
      </p>

      {isPro ? (
        <Button
          variant="outline"
          className="mt-2 h-8 w-full text-[13px]"
          onClick={() => toast("Billing portal would open here")}
        >
          Manage billing
        </Button>
      ) : (
        <Button className="mt-2 h-8 w-full text-[13px]" onClick={() => setProDialogOpen(true)}>
          Upgrade to Pro
        </Button>
      )}

      <ProDialog open={proDialogOpen} onOpenChange={setProDialogOpen} />
    </div>
  );
}
