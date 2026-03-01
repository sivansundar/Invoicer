"use client";

import { Shell } from "@/components/layout/shell";
import { BrandForm } from "@/components/brands/brand-form";

export default function CreateBrandPage() {
  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-lg font-bold">Create Brand</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Set up a new brand profile for invoicing
        </p>
      </div>
      <BrandForm />
    </Shell>
  );
}
