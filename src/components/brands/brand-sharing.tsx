"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Level = "none" | "view" | "edit";
interface Share {
  email: string;
  invoices: Level;
  expenses: Level;
  joined: boolean;
}

const LEVEL_LABELS: Record<Level, string> = { none: "No access", view: "Can view", edit: "Can edit" };

function LevelSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Level;
  onChange: (level: Level) => void;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as Level)}
      className="h-8 text-[13px]"
    >
      {(Object.keys(LEVEL_LABELS) as Level[]).map((level) => (
        <NativeSelectOption key={level} value={level}>
          {LEVEL_LABELS[level]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/**
 * Who else can see this brand (an accountant, say) and what they may do with
 * its invoices and expenses. Owner only; the server enforces every setting.
 */
export function BrandSharing({ brandId, brandName }: { brandId: string; brandName: string }) {
  const url = `/api/brands/${encodeURIComponent(brandId)}/access`;
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.json() : { shares: [] }))
      .then((body) => {
        if (!cancelled) setShares((body as { shares: Share[] }).shares);
      })
      .catch(() => {
        if (!cancelled) setShares([]);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const put = async (share: Omit<Share, "joined">) => {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(share),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      toast(body?.error ?? "That couldn't be saved. Please try again.");
      return null;
    }
    return (await res.json()) as { isNew: boolean; invited: boolean };
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address || busy) return;
    setBusy(true);
    const result = await put({ email: address, invoices: "view", expenses: "view" });
    setBusy(false);
    if (!result) return;
    setShares((prev) => [
      ...(prev ?? []).filter((s) => s.email !== address),
      { email: address, invoices: "view", expenses: "view", joined: false },
    ]);
    setEmail("");
    toast(
      result.invited
        ? `Invitation sent to ${address}`
        : `${address} can now see ${brandName}. No invitation email was sent, so let them know.`
    );
  };

  const handleChange = async (share: Share, patch: Partial<Pick<Share, "invoices" | "expenses">>) => {
    const next = { ...share, ...patch };
    if (!(await put({ email: next.email, invoices: next.invoices, expenses: next.expenses }))) return;
    setShares((prev) => (prev ?? []).map((s) => (s.email === share.email ? next : s)));
    toast(`Access updated for ${share.email}`);
  };

  const handleRemove = async (share: Share) => {
    const res = await fetch(`${url}?email=${encodeURIComponent(share.email)}`, { method: "DELETE" }).catch(
      () => null
    );
    if (!res?.ok) {
      toast("That couldn't be removed. Please try again.");
      return;
    }
    setShares((prev) => (prev ?? []).filter((s) => s.email !== share.email));
    toast(`${share.email} no longer has access to ${brandName}`);
  };

  return (
    <section className="border rounded-[14px] bg-card p-5 mt-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">Sharing</h2>
        <p className="text-[13px] text-muted-foreground mt-1">
          Give someone else, such as your accountant, access to this brand&apos;s invoices and
          expenses. They never see your other brands or your client list.
        </p>
      </div>

      {shares && shares.length > 0 && (
        <ul className="flex flex-col divide-y">
          {shares.map((share) => (
            <li key={share.email} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="flex-1 min-w-[180px] text-sm truncate">
                {share.email}
                {!share.joined && (
                  <span className="ml-2 text-xs text-muted-foreground">Hasn&apos;t signed in yet</span>
                )}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                Invoices
                <LevelSelect
                  label={`Invoices access for ${share.email}`}
                  value={share.invoices}
                  onChange={(invoices) => handleChange(share, { invoices })}
                />
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                Expenses
                <LevelSelect
                  label={`Expenses access for ${share.email}`}
                  value={share.expenses}
                  onChange={(expenses) => handleChange(share, { expenses })}
                />
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => handleRemove(share)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="flex items-end gap-2">
        <div className="flex-1 flex flex-col gap-1.5">
          <Label htmlFor="share-email">Email address</Label>
          <Input
            id="share-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accountant@example.com"
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Inviting…" : "Invite with view access"}
        </Button>
      </form>
    </section>
  );
}
