"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";

const FEATURES = [
  "Unlimited brands with their own details",
  "Per-brand revenue, trends and reports",
  "Separate numbering — SC-001, NL-001…",
];

// MOCK: no billing integration exists. Upgrading only flips a localStorage flag.
export function ProDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { upgrade } = usePlan();
  const router = useRouter();

  const [pending, setPending] = useState(false);

  const handleUpgrade = async () => {
    // The tier is set server-side now, so this awaits a request that can fail.
    // The requirement is unchanged from when it was a localStorage write: a
    // failure must not tell the user Pro is unlocked and send them off to
    // create a brand while `isPro` is still false underneath them.
    setPending(true);
    try {
      await upgrade();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change the plan");
      return;
    } finally {
      setPending(false);
    }
    onOpenChange(false);
    router.push("/brands/create");
    toast("Pro unlocked for this prototype");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[512px] max-w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Run more than one business?</DialogTitle>
          <DialogDescription>
            {
              "Invoicer Pro keeps every brand's invoices, numbering and revenue neatly separate — one login, zero mess."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
              {feature}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button onClick={handleUpgrade} disabled={pending}>Upgrade — ₹499/mo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
