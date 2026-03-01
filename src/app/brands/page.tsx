"use client";

import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { BrandCard } from "@/components/brands/brand-card";
import { useBrands } from "@/hooks/use-brands";
import { Plus } from "lucide-react";

export default function BrandsPage() {
  const { brands, loading, remove } = useBrands();

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-bold">Brands</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage your brand profiles for invoicing
          </p>
        </div>
        <Link href="/brands/create">
          <Button size="sm" className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Brand
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : brands.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No brands yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a brand to start invoicing
          </p>
          <Link href="/brands/create">
            <Button size="sm" className="text-xs mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create Brand
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} onDelete={remove} />
          ))}
        </div>
      )}
    </Shell>
  );
}
