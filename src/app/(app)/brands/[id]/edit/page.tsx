"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { BrandForm } from "@/components/brands/brand-form";
import { useBrands } from "@/hooks/use-brands";

export default function EditBrandPage() {
  const params = useParams();
  const { brands } = useBrands();

  const id = params.id as string;
  const brand = useMemo(() => brands.find((b) => b.id === id) ?? null, [brands, id]);

  if (!brand) {
    return <p className="text-sm text-muted-foreground p-6">Brand not found.</p>;
  }

  return <BrandForm brand={brand} />;
}
