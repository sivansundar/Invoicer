"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { ProDialog } from "@/components/layout/pro-dialog";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { usePlan } from "@/hooks/use-plan";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { FEATURES } from "@/lib/features";
import { nextInvoiceNumber } from "@/lib/storage";
import { cadenceLabel } from "@/lib/followups";
import { Panel, TickBar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import type { Brand, Invoice } from "@/lib/types";

export default function BrandsPage() {
  return <BrandsPageContent />;
}

function ProPill() {
  return (
    <Badge variant="secondary" className="text-[10px] font-normal">
      Pro
    </Badge>
  );
}

function BrandsPageContent() {
  const { brands, loading } = useBrands();
  const { invoices } = useInvoices();
  const { isPro } = usePlan();
  const { setBrandId } = useBrandFilter();
  const router = useRouter();
  const [proDialogOpen, setProDialogOpen] = useState(false);

  const handleNewBrand = () => {
    // Brand creation is unrestricted while billing is hidden — only gate
    // behind Pro once FEATURES.billing is back on.
    if (!FEATURES.billing || isPro) {
      router.push("/brands/create");
    } else {
      setProDialogOpen(true);
    }
  };

  const handleViewInvoices = (brandId: string) => {
    setBrandId(brandId);
    router.push("/dashboard");
  };

  // Before the grid renders: with no brands loaded the only thing on screen
  // is the dashed "Add another brand" tile, which reads as an empty account.
  if (loading) return <CardGridSkeleton />;

  return (
    <div className="flex max-w-[1100px] flex-col gap-5 p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-[560px] text-[14.5px] text-ink-2">
          Each business you invoice from — its own numbering, details and bank account.
        </p>
        {FEATURES.billing && !isPro && (
          <Button onClick={handleNewBrand} variant="outline" className="h-9 gap-1.5 rounded-[10px]">
            <Plus className="size-4" />
            New brand
            <ProPill />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {brands.map((brand) => (
          <BrandCard
            key={brand.id}
            brand={brand}
            invoices={invoices}
            onViewInvoices={() => handleViewInvoices(brand.id)}
          />
        ))}

        <button
          type="button"
          onClick={handleNewBrand}
          className="border border-dashed border-[var(--border-strong)] rounded-[14px] min-h-[160px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          <Plus className="size-[18px]" />
          Add another brand
          {FEATURES.billing && !isPro && <ProPill />}
        </button>
      </div>

      {FEATURES.billing && <ProDialog open={proDialogOpen} onOpenChange={setProDialogOpen} />}
    </div>
  );
}

interface BrandCardProps {
  brand: Brand;
  invoices: Invoice[];
  onViewInvoices: () => void;
}

function BrandCard({ brand, invoices, onViewInvoices }: BrandCardProps) {
  const brandInvoices = invoices.filter((invoice) => invoice.brandId === brand.id);
  const paidGroups = groupTotalsByCurrency(
    brandInvoices.filter((invoice) => invoice.status === "paid")
  );

  const issued = brandInvoices.filter((invoice) => invoice.status !== "draft");
  const paid = brandInvoices.filter((invoice) => invoice.status === "paid");
  const outstanding = brandInvoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "overdue"
  );
  // Count-based, not amount-based: the app bills in three currencies and a
  // single percentage of mixed money would be meaningless.
  const collectionRate =
    issued.length === 0 ? null : Math.round((paid.length / issued.length) * 100);

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] text-[15px] font-semibold text-white"
          style={{ backgroundColor: brand.accentColor }}
        >
          {brand.name.trim().slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold tracking-[-0.014em]">
            {brand.name}
          </span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {brand.gstNumber ? `GSTIN ${brand.gstNumber}` : brand.panNumber ? `PAN ${brand.panNumber}` : "No tax id"}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-field px-2.5 py-0.5 font-mono text-xs text-ink-2">
          {brand.invoicePrefix}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{brand.address}</p>

      <div className="mt-1 flex gap-5 border-t pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">Invoices</div>
          <div className="mt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums">
            {brandInvoices.length}
          </div>
        </div>
        <div className="min-w-0 flex-[1.5]">
          <div className="text-xs text-ink-3">Collected</div>
          <div className="mt-1 truncate text-[17px] font-semibold tracking-[-0.02em] tabular-nums">
            {paidGroups.length === 0 ? "—" : formatCurrencyGroups(paidGroups)}
          </div>
        </div>
        <div className="min-w-0 flex-[1.4]">
          <div className="text-xs text-ink-3">Outstanding</div>
          <div
            className={cn(
              "mt-1 truncate text-[17px] font-semibold tracking-[-0.02em] tabular-nums",
              outstanding.length === 0 && "text-ink-3"
            )}
          >
            {outstanding.length === 0
              ? "—"
              : formatCurrencyGroups(groupTotalsByCurrency(outstanding))}
          </div>
        </div>
      </div>

      {collectionRate !== null && (
        <div className="flex items-center gap-3">
          <TickBar
            pct={collectionRate}
            tone={collectionRate >= 80 ? "green" : collectionRate >= 50 ? "amber" : "red"}
            width={130}
          />
          <span className="text-[12.5px] text-ink-2 tabular-nums">
            {collectionRate}% collected
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <Bell className="size-3.5 shrink-0 text-ink-3" />
        <span className="truncate">{cadenceLabel(brand.followup)}</span>
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <span className="font-mono">Next: {nextInvoiceNumber(brand, invoices)}</span>
      </div>

      <div className="mt-auto flex gap-2 border-t pt-3.5">
        <Button variant="outline" size="sm" onClick={onViewInvoices}>
          View invoices
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/brands/${brand.id}/edit`}>Edit brand</Link>
        </Button>
      </div>
    </Panel>
  );
}
