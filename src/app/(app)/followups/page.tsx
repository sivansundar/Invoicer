"use client";

// MOCK: nothing on this screen (or anywhere in the follow-ups feature) ever
// sends an email. Schedules, templates, the queue below, and every
// invoice's reminder history live in localStorage only and are never
// transmitted anywhere.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Let each brand chase its own unpaid invoices by email. Paid invoices drop out on their
            own.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/followups/templates/create">New template</Link>
        </Button>
      </div>

      <div className="border rounded-[14px] bg-gradient-to-t from-black/[0.05] to-card dark:from-white/[0.06] shadow-xs px-6 py-5">
        <p className="text-sm font-medium tabular-nums">
          {queue.length === 0
            ? "Nothing queued — every unpaid invoice is either paused or out of reminders"
            : `${queue.length} ${queue.length === 1 ? "invoice" : "invoices"} queued · next goes out ${format(queue[0].scheduled, "EEE, d MMM")}`}
        </p>
        <p className="text-[13px] text-muted-foreground mt-0.5 tabular-nums">
          {activeBrandCount} of {brands.length} {brands.length === 1 ? "brand" : "brands"} chasing
          automatically
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Per brand</h2>
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

      {queue.length > 0 && (
        <FollowupQueue entries={queue} templates={templates} onSaveInvoice={saveInvoice} />
      )}
    </div>
  );
}
