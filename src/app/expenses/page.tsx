"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/layout/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrandFilter } from "@/components/brand-filter/brand-filter-provider";
import { useBrands } from "@/hooks/use-brands";
import { useExpenses } from "@/hooks/use-expenses";
import { usePermissions } from "@/hooks/use-permissions";
import {
  EXPENSE_FILE_TYPES,
  MAX_EXPENSE_FILE_BYTES,
  expenseFileProblem,
  expenseFyStartYear,
  formatExpenseAmount,
  reviewReasons,
} from "@/lib/expenses";
import { fyLabel } from "@/lib/reports";

/**
 * Phone photos are often 5 MB or more, over the upload limit. Redrawing one
 * at up to 2400 px as JPEG keeps printed text readable at a fraction of the
 * size. PDFs and already-small images pass through untouched.
 */
async function fitPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_EXPENSE_FILE_BYTES / 2) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Couldn't decode it here; let the size check decide.
    return file;
  }
}

export default function ExpensesPage() {
  return (
    <Shell>
      <ExpensesContent />
    </Shell>
  );
}

function ExpensesContent() {
  const router = useRouter();
  const { brands } = useBrands();
  const { expenses, upload } = useExpenses();
  const { canEdit, canView } = usePermissions();
  const { brandId: filterBrandId } = useBrandFilter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fy, setFy] = useState<string>("all");

  const uploadBrands = brands.filter((b) => canEdit(b.id, "expenses"));
  const [chosenBrandId, setChosenBrandId] = useState("");
  // Follow the sidebar's brand filter when it names a brand this user can add to.
  const uploadBrandId =
    uploadBrands.find((b) => b.id === filterBrandId)?.id ??
    uploadBrands.find((b) => b.id === chosenBrandId)?.id ??
    uploadBrands[0]?.id;

  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const visible = useMemo(
    () =>
      expenses
        .filter((e) => canView(e.brandId, "expenses"))
        .filter((e) => !filterBrandId || e.brandId === filterBrandId),
    [expenses, canView, filterBrandId]
  );
  const years = useMemo(
    () =>
      [...new Set(visible.map((e) => expenseFyStartYear(e.date)).filter((y): y is number => y !== null))].sort(
        (a, b) => b - a
      ),
    [visible]
  );
  const rows = useMemo(
    () =>
      visible
        .filter((e) => fy === "all" || String(expenseFyStartYear(e.date)) === fy)
        // Newest invoice first; undated ones (usually unread files) on top so they get noticed.
        .sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999")),
    [visible, fy]
  );

  const handleFiles = async (list: FileList | null) => {
    if (!list || !uploadBrandId) return;
    for (const original of Array.from(list)) {
      const file = await fitPhoto(original);
      const problem = expenseFileProblem(file);
      if (problem) {
        toast(`${file.name}: ${problem}`);
        continue;
      }
      setUploading(file.name);
      const expense = await upload(file, uploadBrandId);
      if (expense) {
        toast(
          expense.status === "failed"
            ? `${file.name} is saved, but it couldn't be read. Open it to enter the details.`
            : `${file.name} read: ${expense.vendorName || "unknown vendor"}, ${formatExpenseAmount(expense.total, expense.currency)}`
        );
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="p-6 max-w-[1100px] flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Purchase invoices you&apos;ve uploaded. Totals, tax and line items are read from each file.
          </p>
        </div>

        {uploadBrands.length > 0 && (
          <div className="flex items-center gap-2">
            {uploadBrands.length > 1 && (
              <NativeSelect
                aria-label="Brand to add expenses to"
                value={uploadBrandId}
                onChange={(e) => setChosenBrandId(e.target.value)}
              >
                {uploadBrands.map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {b.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={EXPENSE_FILE_TYPES.join(",")}
              className="sr-only"
              aria-label="Purchase invoice files"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading !== null} className="gap-1.5">
              <Upload className="size-4" />
              {uploading ? `Reading ${uploading}…` : "Upload invoices"}
            </Button>
          </div>
        )}
      </div>

      {years.length > 1 && (
        <NativeSelect
          aria-label="Financial year"
          value={fy}
          onChange={(e) => setFy(e.target.value)}
          className="w-fit"
        >
          <NativeSelectOption value="all">All years</NativeSelectOption>
          {years.map((y) => (
            <NativeSelectOption key={y} value={String(y)}>
              {fyLabel(y)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}

      {rows.length === 0 ? (
        <p className="border border-dashed rounded-[14px] p-10 text-center text-sm text-muted-foreground">
          {uploadBrands.length > 0
            ? "No expenses yet. Upload a PDF or a photo of a purchase invoice to add one."
            : brands.length === 0
              ? "Create a brand first, then upload purchase invoices to it."
              : "No expenses to show."}
        </p>
      ) : (
        <div className="border rounded-[14px] bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Invoice no.</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const review = reviewReasons(e);
                return (
                  <TableRow
                    key={e.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/expenses/${e.id}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") router.push(`/expenses/${e.id}`);
                    }}
                  >
                    <TableCell className="font-mono text-xs">{e.date ?? "—"}</TableCell>
                    <TableCell className="font-medium">{e.vendorName || e.fileName}</TableCell>
                    <TableCell className="font-mono text-xs">{e.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>{brandName.get(e.brandId) ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatExpenseAmount(e.cgst + e.sgst + e.igst + e.otherTax, e.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatExpenseAmount(e.total, e.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {review.length > 0 && (
                        <Badge variant="secondary" title={review.join(" ")}>
                          {e.status === "failed" ? "Not read" : "Needs review"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
