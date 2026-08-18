"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBrands } from "@/hooks/use-brands";
import { useInvoices } from "@/hooks/use-invoices";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { LogoUploadError, nextInvoiceNumber } from "@/lib/storage";
import { defaultFollowupConfig } from "@/lib/seed";
import { BRAND_PALETTE } from "@/lib/palette";
import { DEFAULT_INVOICE_DESIGN, INVOICE_DESIGN_OPTIONS } from "@/lib/invoice-design";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { BrandLogo } from "@/components/brands/brand-logo";
import { brandPreviewBody, latestInvoiceForBrand } from "@/lib/brand-preview";
import { snapshotFromBrand } from "@/lib/migrate";
import {
  brandDeleteGuard,
  derivePrefix,
  downsampleImage,
  invoiceUsageLabel,
  nextUnusedAccentColor,
  validateLogoFile,
} from "@/lib/brands";
import { cn } from "@/lib/utils";
import type { Brand, InvoiceDesign } from "@/lib/types";

interface BrandFormProps {
  brand?: Brand;
}

export function BrandForm({ brand }: BrandFormProps) {
  const router = useRouter();
  const { brands, save, remove } = useBrands();
  const { invoices } = useInvoices();
  const { brandId: activeBrandId, setBrandId } = useBrandFilter();
  const isEdit = !!brand;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generated once per mount rather than inline in `handleSubmit`. A brand's
  // id has to exist before the first save (see `saveBrand`'s doc comment —
  // the storage INSERT policy checks for the row), so a create form must
  // pick one before it knows whether the save will succeed. Computing it
  // fresh on every submit would mint a new id on every retry: the failed
  // attempt's row (saveBrand upserts the whole row before touching Storage,
  // so it can commit even though the promise rejects) would then be orphaned
  // rather than the one a retry updates. `useRef` alone still evaluates its
  // argument on every render (and discards it after mount), which would call
  // `crypto.randomUUID()` on every keystroke for nothing — the `??`
  // short-circuits that after the first render, only ever assigning once.
  const brandIdRef = useRef<string | undefined>(undefined);
  const brandId = brandIdRef.current ?? (brandIdRef.current = brand?.id ?? crypto.randomUUID());

  const [name, setName] = useState(brand?.name ?? "");
  const [prefix, setPrefix] = useState(brand?.invoicePrefix ?? "");
  // A data URL, set only by a NEW upload in this session.
  const [logo, setLogo] = useState(brand?.logo ?? "");
  // The already-stored object, until a new upload replaces it. Kept as its
  // own piece of state rather than folded into `logo` with a sentinel value:
  // the two mean different things, and collapsing them would make "the user
  // removed the logo" indistinguishable from "the user kept the existing
  // one" — see `handleRemoveLogo` below.
  const [logoPath, setLogoPath] = useState(brand?.logoPath);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [accentColor, setAccentColor] = useState(
    brand?.accentColor ?? nextUnusedAccentColor(brands)
  );
  const [invoiceDesign, setInvoiceDesign] = useState<InvoiceDesign>(
    brand?.invoiceDesign ?? DEFAULT_INVOICE_DESIGN
  );
  const [address, setAddress] = useState(brand?.address ?? "");
  const [email, setEmail] = useState(brand?.email ?? "");
  const [phone, setPhone] = useState(brand?.phone ?? "");
  const [gstNumber, setGstNumber] = useState(brand?.gstNumber ?? "");
  const [panNumber, setPanNumber] = useState(brand?.panNumber ?? "");
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

  // Everything the form would save right now, minus the id — built here
  // rather than inside `handleSubmit` so the preview and the save path can
  // never disagree about what a field does. Adding a brand field to one
  // therefore adds it to the other by construction.
  //
  // Deliberately not memoized: the dependency array would have to list every
  // field above, and a field added later but forgotten there would silently
  // freeze the preview. Rebuilding this plain object each render costs
  // nothing next to the render it feeds.
  const draftBrand: Omit<Brand, "id"> = {
    name: name.trim(),
    address,
    email,
    phone: phone || undefined,
    gstNumber: gstNumber || undefined,
    panNumber: panNumber || undefined,
    logo: logo || undefined,
    // Carried so the preview resolves an existing Storage logo, and so
    // saving an untouched, already-migrated brand doesn't blow its path away
    // — `brandToRow` writes `null` to `logo_path` for whatever is here.
    // Replaced by `saveBrand` with a fresh path when `logo` above is a new
    // data URL.
    logoPath,
    invoicePrefix: effectivePrefix,
    accentColor,
    followup: brand?.followup ?? defaultFollowupConfig(),
    invoiceDesign,
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

  // The brand half of the preview is the live form; the invoice half is the
  // brand's own latest invoice, or placeholder contents when it has none
  // (always the case on the create form, where `brand` is undefined).
  // `snapshotFromBrand` is the same function the invoice form uses to freeze a
  // brand onto a real invoice, so what's previewed here is what a client
  // would actually receive.
  const previewSnapshot = snapshotFromBrand({ ...draftBrand, id: brand?.id ?? "" });
  const latestInvoice = latestInvoiceForBrand(invoices, brand?.id);
  const previewBody = brandPreviewBody(latestInvoice, effectivePrefix);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Always clear the input's value, success or failure — otherwise picking
    // the same (rejected, or already-set) file twice in a row never fires
    // another change event.
    e.target.value = "";
    if (!file) return;

    const error = validateLogoFile(file);
    if (error) {
      toast(error);
      return;
    }

    setLogoProcessing(true);
    try {
      // Downsamples to a small, bounded PNG rather than storing the upload
      // verbatim — `snapshotFromBrand` copies this value into every future
      // invoice's frozen snapshot, so its stored size scales with invoice
      // count, not brand count (see `MAX_LOGO_STORED_BYTES` in `@/lib/brands`).
      const dataUrl = await downsampleImage(file);
      setLogo(dataUrl);
      // A new upload supersedes whatever was already in Storage.
      setLogoPath(undefined);
    } catch (err) {
      // Covers both a corrupt/unreadable file and the post-downsample size
      // backstop — either way the failure is loud, not a silently-unset logo.
      toast(err instanceof Error ? err.message : "Logo could not be processed");
    } finally {
      setLogoProcessing(false);
    }
  };

  // Clears both pieces of state — leaving `logoPath` behind would resave the
  // brand still pointing at its old Storage object, which is not a removal.
  const handleRemoveLogo = () => {
    setLogo("");
    setLogoPath(undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Give your brand a name first");
      return;
    }

    const savedPrefix = effectivePrefix;

    // `draftBrand` already holds every field exactly as the preview rendered
    // it — the id was decided once, at mount (`brandId`), so a retry after
    // a failed save reuses it rather than minting a new one.
    const record: Brand = { ...draftBrand, id: brandId };

    // `save` (from `useBrands`) rejects when the write didn't persist — a
    // network failure, or an RLS policy refusing the row. Toasting success
    // and navigating away regardless would tell the user this worked when it
    // didn't, and take them off the one screen still holding what they typed.
    try {
      await save(record);
    } catch (err) {
      // The row committed and only the logo didn't — see `LogoUploadError`.
      // Reporting this as a failed save would send the user back to retype
      // fields that are already stored, and a resubmit would re-upload a
      // logo they may not have wanted to touch. The brand renders from the
      // base64 still in `logo_data` until the next save retries the upload.
      if (err instanceof LogoUploadError) {
        toast(`${trimmedName} saved, but the logo couldn't be uploaded — replace it to try again`);
        router.push("/brands");
        return;
      }
      toast(err instanceof Error ? err.message : "Couldn't save this brand — try again");
      return;
    }

    toast(
      isEdit
        ? `${trimmedName} updated — future invoices use the new details`
        : `${trimmedName} is ready — first invoice will be ${savedPrefix}-${year}-001`
    );
    router.push("/brands");
  };

  const handleDelete = async () => {
    if (!brand) return;
    const guard = brandDeleteGuard(brand, invoices);
    if (!guard.allowed) {
      toast(`Move or delete its ${guard.count} invoices first`);
      return;
    }
    try {
      await remove(brand.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't remove this brand — try again");
      return;
    }
    if (activeBrandId === brand.id) {
      setBrandId(null);
    }
    toast(`${brand.name} removed`);
    router.push("/brands");
  };

  return (
    <div className="flex flex-wrap items-stretch flex-1 min-h-0">
      {/* Left pane: the form */}
      <div className="flex-[1_1_460px] min-w-0 p-8 max-w-[660px]">
        <Link
          href="/brands"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
        >
          <ChevronLeft className="size-3.5" />
          Brands
        </Link>
        <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
          {isEdit ? `Edit ${brand.name}` : "New brand"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isEdit
            ? "Changes apply to invoices you create from here on — past invoices keep their original details."
            : "Set it up once — every invoice from this brand fills itself in."}
        </p>

        <form
          onSubmit={handleSubmit}
          className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5 mt-6"
        >
          <div className="flex gap-3 flex-wrap items-start">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Logo</Label>
              {logo || logoPath ? (
                <div className="relative w-fit">
                  <BrandLogo
                    source={{ logo, logoPath }}
                    name={name || "Brand"}
                    className="size-9 rounded-lg object-contain border"
                    fallbackClassName="size-9 rounded-lg border flex items-center justify-center text-sm font-semibold text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    aria-label="Remove logo"
                    className="absolute -top-1.5 -right-1.5 size-4 rounded-full border bg-background flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoProcessing}
                  aria-label="Upload logo"
                  className="size-9 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <Upload className="size-3.5" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
            </div>
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
            <Label className="text-xs text-muted-foreground">Invoice design</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={1}
              value={invoiceDesign}
              onValueChange={(value) => {
                if (value) setInvoiceDesign(value as InvoiceDesign);
              }}
              className="grid grid-cols-2 gap-2 w-full"
            >
              {INVOICE_DESIGN_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                  className="h-auto w-full flex-col items-start justify-start gap-0.5 whitespace-normal rounded-lg px-3 py-2.5 text-left data-[state=on]:border-foreground data-[state=on]:bg-accent"
                >
                  <span className="text-[13px] font-medium">{option.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.description}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">GST number</Label>
              <Input
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label className="text-xs text-muted-foreground">PAN number</Label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="Optional"
                className="text-sm uppercase"
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

      {/* Right pane: how this brand's invoices actually look. Sticky because
          the form runs well past a screen height — the bank details at the
          bottom are printed on the very document shown here, so it has to
          still be visible by the time you reach them. */}
      <div className="flex-[1_1_508px] min-w-[508px] bg-muted border-l p-6">
        <div className="sticky top-6">
          <div className="mb-4">
            <p className="text-sm font-medium">Invoice preview</p>
            <p className="text-[13px] text-muted-foreground">
              {latestInvoice
                ? `Your latest invoice, ${latestInvoice.invoiceNumber}, in this design`
                : "Sample invoice — updates as you type"}
            </p>
          </div>
          <InvoicePreview snapshot={previewSnapshot} {...previewBody} />
        </div>
      </div>
    </div>
  );
}
