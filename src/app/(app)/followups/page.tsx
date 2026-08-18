"use client";

// MOCK: nothing on this screen (or anywhere in the follow-ups feature) ever
// sends an email. Schedules, templates, the queue below, and every
// invoice's reminder history live in localStorage only and are never
// transmitted anywhere.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Send } from "lucide-react";
import { IconTile, Panel, SectionLabel } from "@/components/ui/primitives";
import { BrandFollowupCard } from "@/components/followups/brand-followup-card";
import { TemplateList } from "@/components/followups/template-list";
import { FollowupQueue } from "@/components/followups/followup-queue";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { useTemplates } from "@/hooks/use-templates";
import { buildFollowupQueue } from "@/lib/followup-queue";
import { FEATURES } from "@/lib/features";

export default function FollowupsPage() {
  const router = useRouter();

  // Follow-ups isn't shipped yet — redirect a direct/bookmarked visit to
  // the dashboard rather than rendering a half-built screen or a 404 (the
  // route itself is real, it's just switched off). Remove this guard once
  // FEATURES.followups is back on.
  useEffect(() => {
    if (!FEATURES.followups) router.replace("/dashboard");
  }, [router]);

  if (!FEATURES.followups) return null;

  return <FollowupsPageContent />;
}

function FollowupsPageContent() {
  const { brands, save: saveBrand } = useBrands();
  const { invoices, save: saveInvoice } = useInvoices();
  const { templates } = useTemplates();

  const queue = buildFollowupQueue(invoices, brands);
  const activeBrandCount = brands.filter((brand) => brand.followup.enabled).length;

  return (
    <div className="flex max-w-[1100px] flex-col gap-5 p-8">
      <p className="max-w-[560px] text-[14.5px] text-ink-2">
        Let each brand chase its own unpaid invoices by email. Paid invoices drop out on their own.
      </p>

      <Panel className="flex flex-wrap items-center gap-4 px-5 py-[18px]">
        <IconTile icon={queue.length === 0 ? Check : Send} tone={queue.length === 0 ? "green" : "amber"} />
        <div className="min-w-[240px] flex-1">
          <div className="text-[15.5px] font-semibold tracking-[-0.012em] tabular-nums">
            {queue.length === 0
              ? "Nothing queued"
              : `${queue.length} ${queue.length === 1 ? "invoice" : "invoices"} queued`}
          </div>
          <div className="mt-1 text-[13px] text-ink-2 tabular-nums">
            {queue.length === 0
              ? "Every unpaid invoice is either paused or out of reminders."
              : `Next goes out ${format(queue[0].scheduled, "EEE, d MMM")} · ${activeBrandCount} of ${brands.length} ${brands.length === 1 ? "brand" : "brands"} chasing automatically`}
          </div>
        </div>
      </Panel>

      {queue.length > 0 && (
        <FollowupQueue entries={queue} templates={templates} onSaveInvoice={saveInvoice} />
      )}

      <div className="flex flex-col gap-3.5">
        <SectionLabel>Schedules by brand</SectionLabel>
        <div className="flex flex-col gap-3">
          {brands.map((brand) => (
            <BrandFollowupCard
              key={brand.id}
              brand={brand}
              invoices={invoices}
              templates={templates}
              onSaveBrand={saveBrand}
            />
          ))}
        </div>
      </div>

      <TemplateList templates={templates} brands={brands} />
    </div>
  );
}
