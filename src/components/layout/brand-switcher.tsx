"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { usePlan } from "@/hooks/use-plan";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { ProDialog } from "./pro-dialog";

function initials(name: string) {
  return name.slice(0, 2);
}

export function BrandSwitcher() {
  const { brands } = useBrands();
  const { invoices } = useInvoices();
  const { isPro } = usePlan();
  const { brandId, setBrandId } = useBrandFilter();
  const router = useRouter();
  const [proDialogOpen, setProDialogOpen] = useState(false);

  const selectedBrand = brands.find((brand) => brand.id === brandId) ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-sidebar-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground">
              {selectedBrand ? initials(selectedBrand.name) : "In"}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {selectedBrand ? selectedBrand.name : "All brands"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {selectedBrand
                  ? `${selectedBrand.invoicePrefix} · ${isPro ? "Pro" : "Free"}`
                  : `${brands.length} ${brands.length === 1 ? "brand" : "brands"}`}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => setBrandId(null)} className="gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--muted-foreground)" }}
            />
            <span className="flex-1 truncate">All brands</span>
            <span className="text-xs text-muted-foreground">{invoices.length}</span>
          </DropdownMenuItem>

          {brands.map((brand) => (
            <DropdownMenuItem
              key={brand.id}
              onSelect={() => setBrandId(brand.id)}
              className="gap-2"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: brand.accentColor }}
              />
              <span className="flex-1 truncate">{brand.name}</span>
              <span className="text-xs text-muted-foreground">
                {invoices.filter((invoice) => invoice.brandId === brand.id).length}
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              if (isPro) {
                router.push("/brands/create");
              } else {
                event.preventDefault();
                setProDialogOpen(true);
              }
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="flex-1">Add brand</span>
            {!isPro && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                Pro
              </Badge>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProDialog open={proDialogOpen} onOpenChange={setProDialogOpen} />
    </>
  );
}
