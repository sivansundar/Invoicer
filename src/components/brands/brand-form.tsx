"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { nextInvoiceNumber } from "@/lib/storage";
import { defaultFollowupConfig } from "@/lib/seed";
import { BRAND_PALETTE } from "@/lib/palette";
import { brandDeleteGuard, derivePrefix, invoiceUsageLabel, nextUnusedAccentColor } from "@/lib/brands";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/types";

interface BrandFormProps {
  brand?: Brand;
}

export function BrandForm({ brand }: BrandFormProps) {
  const router = useRouter();
  const { brands, save, remove } = useBrands();
  const { invoices } = useInvoices();
  const { brandId: activeBrandId, setBrandId } = useBrandFilter();
  const isEdit = !!brand;

  const [name, setName] = useState(brand?.name ?? "");
  const [prefix, setPrefix] = useState(brand?.invoicePrefix ?? "");
  const [accentColor, setAccentColor] = useState(
    brand?.accentColor ?? nextUnusedAccentColor(brands)
  );
  const [address, setAddress] = useState(brand?.address ?? "");
  const [email, setEmail] = useState(brand?.email ?? "");
  const [gstNumber, setGstNumber] = useState(brand?.gstNumber ?? "");
  const [accountName, setAccountName] = useState(brand?.bankDetails.accountName ?? "");
  const [bankName, setBankName] = useState(brand?.bankDetails.bankName ?? "");
  const [branch, setBranch] = useState(brand?.bankDetails.branch ?? "");
  const [accountNumber, setAccountNumber] = useState(brand?.bankDetails.accountNumber ?? "");
  const [ifscCode, setIfscCode] = useState(brand?.bankDetails.ifscCode ?? "");
  const [upiId, setUpiId] = useState(brand?.bankDetails.upiId ?? "");

  const effectivePrefix = (prefix.trim() || derivePrefix(name)).toUpperCase();
  const year = new Date().getFullYear();

  const hint = isEdit
    ? `Next invoice will be ${nextInvoiceNumber(brand, invoices)}`
    : `Invoices will look like ${effectivePrefix}-${year}-001`;

  const brandInvoices = isEdit ? invoices.filter((invoice) => invoice.brandId === brand.id) : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Give your brand a name first");
      return;
    }

    const savedPrefix = effectivePrefix;

    const record: Brand = {
      // Spreads forward fields the v2 form has no UI for (`phone`,
      // `panNumber`, `logo`) so editing a brand never silently wipes data
      // the redesigned form simply doesn't surface. A no-op on create,
      // since there's nothing yet to preserve.
      ...(brand ?? {}),
      id: brand?.id ?? crypto.randomUUID(),
      name: trimmedName,
      address,
      email,
      gstNumber: gstNumber || undefined,
      invoicePrefix: savedPrefix,
      // Dead state (see `nextInvoiceNumber` — the live calculation from
      // `@/lib/storage` is the only source of truth ever read). Carried
      // forward on edit purely to satisfy the `Brand` shape until Task 22
      // removes the field.
      nextInvoiceNumber: brand?.nextInvoiceNumber ?? 1,
      accentColor,
      followup: brand?.followup ?? defaultFollowupConfig(),
      bankDetails: {
        accountName,
        accountNumber,
        bankName,
        ifscCode,
        branch: branch || undefined,
        upiId: upiId || undefined,
      },
      createdAt: brand?.createdAt ?? new Date().toISOString(),
    };

    save(record);
    toast(
      isEdit
        ? `${trimmedName} updated — future invoices use the new details`
        : `${trimmedName} is ready — first invoice will be ${savedPrefix}-${year}-001`
    );
    router.push("/brands");
  };

  const handleDelete = () => {
    if (!brand) return;
    const guard = brandDeleteGuard(brand, invoices);
    if (!guard.allowed) {
      toast(`Move or delete its ${guard.count} invoices first`);
      return;
    }
    remove(brand.id);
    if (activeBrandId === brand.id) {
      setBrandId(null);
    }
    toast(`${brand.name} removed`);
    router.push("/brands");
  };

  return (
    <div className="p-6 max-w-[660px]">
      <Link
        href="/brands"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
      >
        <ChevronLeft className="size-3.5" />
        Brands
      </Link>
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mt-3">
        {isEdit ? `Edit ${brand.name}` : "New brand"}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {isEdit
          ? "Changes apply to invoices you create from here on — past invoices keep their original details."
          : "Set it up once — every invoice from this brand fills itself in."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5 mt-6"
      >
        <div className="flex gap-3 flex-wrap">
          <div className="flex-[2_1_220px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Brand name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sundar Design Co"
              className="text-sm"
            />
          </div>
          <div className="flex-[1_1_110px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Prefix</Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="auto"
              className="text-sm uppercase"
            />
          </div>
        </div>

        <div className="bg-muted border rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground">
          {hint}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Accent colour</Label>
          <div className="flex gap-2">
            {BRAND_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Accent colour ${color}`}
                aria-pressed={accentColor === color}
                onClick={() => setAccentColor(color)}
                className="size-6 rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow: accentColor === color ? "0 0 0 2px var(--foreground)" : undefined,
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Address</Label>
          <Textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, PIN"
            rows={3}
            className="text-sm"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="billing@yourbrand.in"
              className="text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">GST number</Label>
            <Input
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              placeholder="Optional"
              className="text-sm"
            />
          </div>
        </div>

        <div className="border-t pt-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold">Getting paid</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Printed at the bottom of every invoice.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account name</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="As on the account"
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bank</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HDFC Bank"
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Branch</Label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g. Indiranagar"
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account number</Label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">IFSC</Label>
              <Input
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">UPI ID</Label>
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="you@okbank"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/brands")}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {isEdit ? "Save changes" : "Create brand"}
          </Button>
        </div>
      </form>

      {isEdit && (
        <div className="flex items-center gap-3 mt-4">
          <span className="text-[13px] text-muted-foreground">
            {invoiceUsageLabel(brandInvoices.length)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "ml-auto",
              "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
            )}
            onClick={handleDelete}
          >
            Delete brand
          </Button>
        </div>
      )}
    </div>
  );
}
