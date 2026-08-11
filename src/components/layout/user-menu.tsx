"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
    <div className="flex items-center gap-2 p-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-accent text-xs font-medium">
        {initialFor(email)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {email ?? "Signed in"}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Sign out"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
