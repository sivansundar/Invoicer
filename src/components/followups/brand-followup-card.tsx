"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildFollowupQueue } from "@/lib/followup-queue";
import { cadenceLabel, DAYS, isUnpaid } from "@/lib/followups";
import type { Brand, EmailTemplate, FollowupConfig, Invoice } from "@/lib/types";

const STOP_AFTER_OPTIONS = [2, 3, 4, 6, 0] as const;

function stopAfterLabel(value: number): string {
  return value === 0 ? "never — keep nudging" : `after ${value} reminders`;
}

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
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">When to send</Label>
            <ToggleGroup
              type="single"
              value={config.mode}
              onValueChange={(value) => {
                if (value) updateConfig({ mode: value as FollowupConfig["mode"] });
              }}
              className="inline-flex h-9 bg-accent rounded-[10px] p-[3px] gap-0 w-fit"
            >
              <ToggleGroupItem
                value="weekly"
                className="h-[30px] px-2.5 rounded-md text-[13px] font-medium data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground"
              >
                Every week
              </ToggleGroupItem>
              <ToggleGroupItem
                value="custom"
                className="h-[30px] px-2.5 rounded-md text-[13px] font-medium data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground"
              >
                Pick a day &amp; time
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">{cadenceLabel(config)}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email template</Label>
            <div className="flex items-center gap-2">
              <NativeSelect
                value={config.templateId}
                onChange={(e) => updateConfig({ templateId: e.target.value })}
                className="w-[220px]"
              >
                {templates.map((template) => (
                  <NativeSelectOption key={template.id} value={template.id}>
                    {template.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/followups/templates/${config.templateId}`}>Edit</Link>
              </Button>
            </div>
          </div>

          {config.mode === "custom" && (
            <div className="bg-muted border rounded-[10px] px-4 py-3.5 flex gap-4 flex-wrap">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Day</Label>
                <NativeSelect
                  size="sm"
                  value={config.weekday}
                  onChange={(e) => updateConfig({ weekday: Number(e.target.value) })}
                >
                  {DAYS.map((day, index) => (
                    <NativeSelectOption key={day} value={index}>
                      {day}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={config.time}
                  onChange={(e) => updateConfig({ time: e.target.value })}
                  className="h-8 text-sm w-[130px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Repeat</Label>
                <NativeSelect
                  size="sm"
                  value={config.repeat}
                  onChange={(e) =>
                    updateConfig({ repeat: e.target.value as FollowupConfig["repeat"] })
                  }
                >
                  <NativeSelectOption value="week">Every week</NativeSelectOption>
                  <NativeSelectOption value="month">Every month</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stop reminders</Label>
              <NativeSelect
                size="sm"
                value={config.stopAfter}
                onChange={(e) => updateConfig({ stopAfter: Number(e.target.value) })}
                className="w-[190px]"
              >
                {STOP_AFTER_OPTIONS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {stopAfterLabel(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <p className="text-xs text-muted-foreground flex-1 min-w-[220px]">
              Reminders always stop the moment an invoice is marked paid — this is just the cap
              for the stubborn ones.
            </p>
          </div>

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
