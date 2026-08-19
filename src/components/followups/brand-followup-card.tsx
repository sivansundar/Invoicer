"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { buildFollowupQueue } from "@/lib/followup-queue";
import { isUnpaid } from "@/lib/followups";
import { reminderSchedule } from "@/lib/reminder-stages";
import { StageEditor } from "./stage-editor";
import type { Brand, EmailTemplate, FollowupConfig, Invoice } from "@/lib/types";

interface BrandFollowupCardProps {
  brand: Brand;
  invoices: Invoice[];
  templates: EmailTemplate[];
  onSaveBrand: (brand: Brand) => Promise<Brand>;
}

export function BrandFollowupCard({
  brand,
  invoices,
  templates,
  onSaveBrand,
}: BrandFollowupCardProps) {
  const config = brand.followup;
  // The stored blob may still be the old single-cadence shape; `reminderSchedule`
  // normalises it on read rather than migrating jsonb for brands that may never
  // turn reminders on.
  const schedule = reminderSchedule(config);
  const brandInvoices = invoices.filter((invoice) => invoice.brandId === brand.id);
  const unpaidInvoices = brandInvoices.filter(isUnpaid);
  const queuedCount = buildFollowupQueue(unpaidInvoices, [brand]).length;
  const remindersSent = brandInvoices.reduce(
    (sum, invoice) => sum + (invoice.reminders?.length ?? 0),
    0
  );

  // Every control here is bound straight to the brand record from
  // `useBrands`, so a successful write is already visible as the control's
  // own new value on the next render — there's nothing further to toast on
  // success, and a failed write leaves the record (and therefore every
  // control reading from it) unchanged, so the inputs revert on their own.
  //
  // The rejection still has to be caught rather than dropped. When this was
  // localStorage-backed, `writeLocalStorage` surfaced its own quota toast and
  // the boolean could be discarded; a rejected promise from the network has
  // nobody else reporting it, and an uncaught one is an unhandled rejection.
  const updateConfig = (patch: Partial<FollowupConfig>) => {
    onSaveBrand({ ...brand, followup: { ...config, ...patch } }).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : "Couldn't save that change — try again");
    });
  };

  return (
    <div className="border rounded-[14px] bg-card shadow-sm px-6 py-5 flex flex-col gap-4.5">
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: brand.accentColor }}
        />
        <span className="text-[15px] font-semibold">{brand.name}</span>
        {config.enabled ? (
          <Badge className="bg-accent text-foreground border-transparent">Active</Badge>
        ) : (
          <Badge variant="outline">Paused</Badge>
        )}
        <div className="flex-1" />
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => updateConfig({ enabled: checked })}
        />
      </div>

      {!config.enabled ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing goes out from this brand. Turn it on to schedule polite reminders after the due
          date.
        </p>
      ) : (
        <>
          <StageEditor
            schedule={schedule}
            templates={templates}
            onChange={(next) =>
              updateConfig({
                stages: next.stages,
                repeatFinalEveryDays: next.repeatFinalEveryDays,
              })
            }
          />

          <div className="border-t pt-3.5 flex gap-5 text-[13px] text-muted-foreground">
            <span className="tabular-nums">
              {unpaidInvoices.length === 0
                ? "No unpaid invoices right now"
                : `${queuedCount} of ${unpaidInvoices.length} unpaid invoices queued`}
            </span>
          </div>
        </>
      )}

      {/*
        Outside the enabled/disabled branch on purpose: switching reminders off
        does not erase what already went out, so the history stays reachable.
      */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3.5">
        <span className="flex-1 text-[13px] text-muted-foreground tabular-nums">
          {remindersSent === 0 ? "Nothing sent yet" : `${remindersSent} reminders sent so far`}
        </span>
        {remindersSent > 0 && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/followups/brands/${brand.id}`}>
              <Clock className="size-3.5" />
              View all {remindersSent} sent
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
