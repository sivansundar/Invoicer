"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProDialog } from "@/components/layout/pro-dialog";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { usePlan } from "@/hooks/use-plan";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { FEATURES } from "@/lib/features";
import { nextInvoiceNumber } from "@/lib/storage";
import { cadenceLabel } from "@/lib/followups";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import type { Brand, Invoice } from "@/lib/types";

export default function BrandsPage() {
  return (
    <Shell>
      <BrandsPageContent />
    </Shell>
  );
}

function ProPill() {
  return (
    <Badge variant="secondary" className="text-[10px] font-normal">
      Pro
    </Badge>
  );
}

function BrandsPageContent() {
  const { brands } = useBrands();
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

  return (
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Brands</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each business you invoice from — its own numbering, details and bank account.
          </p>
        </div>
        <Button onClick={handleNewBrand} className="gap-1.5">
          <Plus className="size-4" />
          New brand
          {FEATURES.billing && !isPro && <ProPill />}
        </Button>
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
  const followupOn = brand.followup.enabled;

  return (
    <div className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: brand.accentColor }}
        />
        <span className="text-base font-semibold flex-1 truncate">{brand.name}</span>
        <span className="font-mono text-xs border rounded-full px-2 py-0.5 text-muted-foreground">
          {brand.invoicePrefix}
        </span>
      </div>

      <p className="text-[13px] text-muted-foreground whitespace-pre-line">{brand.address}</p>

      <p className="text-[13px] text-muted-foreground">
        {brand.bankDetails.bankName}
        {brand.bankDetails.accountNumber && ` · ${brand.bankDetails.accountNumber}`}
      </p>

      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span
          className="size-[6px] rounded-full shrink-0"
          style={{ backgroundColor: followupOn ? "#059669" : "var(--border-strong)" }}
        />
        {cadenceLabel(brand.followup)}
      </div>

      <div className="border-t pt-3 flex gap-6 text-[13px] items-center">
        <span>Invoices {brandInvoices.length}</span>
        <span>Paid {formatCurrencyGroups(paidGroups)}</span>
        <span className="ml-auto font-mono text-xs">
          Next: {nextInvoiceNumber(brand, invoices)}
        </span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onViewInvoices}>
          View invoices
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/brands/${brand.id}/edit`}>Edit</Link>
        </Button>
      </div>
    </div>
  );
}
