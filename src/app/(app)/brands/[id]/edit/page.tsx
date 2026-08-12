"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { BrandForm } from "@/components/brands/brand-form";
import { FormSkeleton } from "@/components/ui/page-skeletons";
import { useBrands } from "@/hooks/use-brands";

export default function EditBrandPage() {
  const params = useParams();
  const { brands, loading } = useBrands();

  const id = params.id as string;
  const brand = useMemo(() => brands.find((b) => b.id === id) ?? null, [brands, id]);

  // Before the not-found check, never after: while the brands query is in
  // flight there is no brand to find, and rendering "Brand not found" then
  // tells the user their brand is gone.
  if (loading) return <FormSkeleton fields={8} />;

  if (!brand) {
    return <p className="text-sm text-muted-foreground p-6">Brand not found.</p>;
  }

  return <BrandForm brand={brand} />;
}
