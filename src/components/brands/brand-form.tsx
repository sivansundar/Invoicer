"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Brand } from "@/lib/types";
import { useBrands } from "@/hooks/use-brands";
import { Upload, X } from "lucide-react";

interface BrandFormProps {
  brand?: Brand;
}

export function BrandForm({ brand }: BrandFormProps) {
  const router = useRouter();
  const { save } = useBrands();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: brand?.name ?? "",
    address: brand?.address ?? "",
    email: brand?.email ?? "",
    phone: brand?.phone ?? "",
    gstNumber: brand?.gstNumber ?? "",
    logo: brand?.logo ?? "",
    invoicePrefix: brand?.invoicePrefix ?? "",
    accountName: brand?.bankDetails.accountName ?? "",
    accountNumber: brand?.bankDetails.accountNumber ?? "",
    bankName: brand?.bankDetails.bankName ?? "",
    ifscCode: brand?.bankDetails.ifscCode ?? "",
    branch: brand?.bankDetails.branch ?? "",
    upiId: brand?.bankDetails.upiId ?? "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update("logo", ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const brandData: Brand = {
      id: brand?.id ?? crypto.randomUUID(),
      name: form.name,
      address: form.address,
      email: form.email,
      phone: form.phone || undefined,
      gstNumber: form.gstNumber || undefined,
      logo: form.logo || undefined,
      invoicePrefix: form.invoicePrefix.toUpperCase(),
      nextInvoiceNumber: brand?.nextInvoiceNumber ?? 1,
      bankDetails: {
        accountName: form.accountName,
        accountNumber: form.accountNumber,
        bankName: form.bankName,
        ifscCode: form.ifscCode,
        branch: form.branch || undefined,
        upiId: form.upiId || undefined,
      },
      createdAt: brand?.createdAt ?? new Date().toISOString(),
    };
    save(brandData);
    router.push("/brands");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Brand Details
        </h3>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs">
              Brand Name *
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Sivan Studio"
              required
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address" className="text-xs">
              Address *
            </Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="123 Main St, City, State, PIN"
              required
              rows={3}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="hello@studio.com"
                required
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs">
                Phone
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+91 9876543210"
                className="text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gstNumber" className="text-xs">
                GST Number
              </Label>
              <Input
                id="gstNumber"
                value={form.gstNumber}
                onChange={(e) => update("gstNumber", e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix" className="text-xs">
                Invoice Prefix *
              </Label>
              <Input
                id="invoicePrefix"
                value={form.invoicePrefix}
                onChange={(e) =>
                  update("invoicePrefix", e.target.value.toUpperCase())
                }
                placeholder="SS"
                required
                maxLength={5}
                className="text-sm uppercase"
              />
              <p className="text-[10px] text-muted-foreground">
                Invoices will be numbered {form.invoicePrefix || "XX"}-001,{" "}
                {form.invoicePrefix || "XX"}-002, etc.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Logo */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Logo
        </h3>
        <div className="flex items-center gap-4">
          {form.logo ? (
            <div className="relative">
              <img
                src={form.logo}
                alt="Logo"
                className="h-16 w-16 object-contain rounded border border-border"
              />
              <button
                type="button"
                onClick={() => update("logo", "")}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-16 w-16 border border-dashed border-border rounded flex items-center justify-center hover:border-foreground/50 transition-colors"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <p className="text-[10px] text-muted-foreground">
            Upload a logo for your invoices. PNG or SVG recommended.
          </p>
        </div>
      </div>

      <Separator />

      {/* Bank Details */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Bank Details
        </h3>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountName" className="text-xs">
                Account Holder Name *
              </Label>
              <Input
                id="accountName"
                value={form.accountName}
                onChange={(e) => update("accountName", e.target.value)}
                required
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber" className="text-xs">
                Account Number *
              </Label>
              <Input
                id="accountNumber"
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value)}
                required
                className="text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankName" className="text-xs">
                Bank Name *
              </Label>
              <Input
                id="bankName"
                value={form.bankName}
                onChange={(e) => update("bankName", e.target.value)}
                required
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ifscCode" className="text-xs">
                IFSC Code *
              </Label>
              <Input
                id="ifscCode"
                value={form.ifscCode}
                onChange={(e) => update("ifscCode", e.target.value)}
                required
                className="text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="branch" className="text-xs">
                Branch
              </Label>
              <Input
                id="branch"
                value={form.branch}
                onChange={(e) => update("branch", e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upiId" className="text-xs">
                UPI ID
              </Label>
              <Input
                id="upiId"
                value={form.upiId}
                onChange={(e) => update("upiId", e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex gap-3">
        <Button type="submit" size="sm" className="text-xs">
          {brand ? "Update Brand" : "Create Brand"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push("/brands")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
