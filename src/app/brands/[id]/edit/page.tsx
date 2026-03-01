"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { BrandForm } from "@/components/brands/brand-form";
import { Brand } from "@/lib/types";
import { getBrand } from "@/lib/storage";

export default function EditBrandPage() {
  const params = useParams();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const b = getBrand(params.id as string);
    setBrand(b);
    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </Shell>
    );
  }

  if (!brand) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Brand not found</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-lg font-bold">Edit Brand</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Update {brand.name}
        </p>
      </div>
      <BrandForm brand={brand} />
    </Shell>
  );
}
