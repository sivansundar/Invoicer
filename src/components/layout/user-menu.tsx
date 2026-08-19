"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/lib/features";
import { usePlan } from "@/hooks/use-plan";
import { useSession } from "./session-provider";

export function initialFor(email: string | undefined): string {
  const trimmed = email?.trim() ?? "";
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}

export function UserMenu() {
  const router = useRouter();
  // Supabase auth yields no display name here, only an email — the avatar
  // initial and footer text are both derived from it; there's no separate
  // display-name field to show instead.
  const { email } = useSession();
  const { isPro } = usePlan();

  async function handleSignOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast(error.message);
      return;
    }
    // refresh() so the proxy re-evaluates and clears any cached server render.
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-[11px] px-[11px] py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-field text-[12.5px] font-semibold text-ink-2">
        {initialFor(email)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{email ?? "Signed in"}</span>
        {/* The mockup's second line is "Plan & billing", a link to a screen
            that manages the plan. No such screen exists — the plan is
            managed by the card directly above this row — so this states the
            tier it would have linked to rather than pretending to be a link
            somewhere. Hidden entirely when billing is off, since then there
            is no plan to speak of anywhere in the UI. */}
        {FEATURES.billing && (
          <span className="truncate text-[12.5px] text-ink-3">
            {isPro ? "Pro plan" : "Free plan"}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-ink-2"
        title="Sign out"
        onClick={handleSignOut}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
