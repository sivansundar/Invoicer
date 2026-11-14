"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { BrandForm } from "@/components/brands/brand-form";
import { useBrands } from "@/hooks/use-brands";
import { usePermissions } from "@/hooks/use-permissions";

export default function EditBrandPage() {
  const params = useParams();
  const { brands } = useBrands();

  const id = params.id as string;
  const brand = useMemo(() => brands.find((b) => b.id === id) ?? null, [brands, id]);

  const { isOwner } = usePermissions();

  if (brand && !isOwner(brand.id)) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">
          {brand.name} is shared with you. Only its owner can change its details.
        </p>
      </Shell>
    );
  }

  if (!brand) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground p-6">Brand not found.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <BrandForm brand={brand} />
    </Shell>
  );
}
