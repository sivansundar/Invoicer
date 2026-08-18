"use client";

import { useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { Invoice, Brand, InvoiceStatus } from "@/lib/types";
import {
  FY_MONTHS,
  ReportFilters,
  availableFinancialYears,
  filterInvoices,
  fyLabel,
  fyOrderIndex,
  summarize,
} from "@/lib/reports";
import { SummaryReportPDF } from "./summary-report-pdf";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "sent", label: "Sent" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
];

const DEFAULT_STATUSES: Record<InvoiceStatus, boolean> = {
  paid: true,
  sent: true,
  overdue: true,
  draft: false,
};

/** Start year of the financial year containing today. */
function currentFyStartYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

interface SummaryReportDialogProps {
  invoices: Invoice[];
  brands: Brand[];
}

export function SummaryReportDialog({ invoices, brands }: SummaryReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"config" | "preview">("config");

  const fyOptions = useMemo(() => {
    const derived = availableFinancialYears(invoices);
    const current = currentFyStartYear();
    if (!derived.some((f) => f.startYear === current)) {
      return [{ startYear: current, label: fyLabel(current) }, ...derived].sort(
        (a, b) => b.startYear - a.startYear
      );
    }
    return derived;
  }, [invoices]);

  const [startYear, setStartYear] = useState(() => currentFyStartYear());
  const [fromMonth, setFromMonth] = useState(3); // April
  const [toMonth, setToMonth] = useState(2); // March
  const [brandId, setBrandId] = useState<string>("all");
  const [statuses, setStatuses] = useState<Record<InvoiceStatus, boolean>>(DEFAULT_STATUSES);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);

  const selectedStatuses = ALL_STATUSES.filter((s) => statuses[s.value]).map((s) => s.value);
  const rangeValid = fyOrderIndex(fromMonth) <= fyOrderIndex(toMonth);
  const hasStatus = selectedStatuses.length > 0;

  const filters: ReportFilters = {
    startYear,
    fromMonth,
    toMonth,
    statuses: selectedStatuses,
    brandId: brandId === "all" ? null : brandId,
  };

  const filtered = useMemo(
    () => (rangeValid && hasStatus ? filterInvoices(invoices, filters) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, startYear, fromMonth, toMonth, brandId, statuses, rangeValid, hasStatus]
  );

  const selectedBrand = brandId === "all" ? null : brands.find((b) => b.id === brandId) ?? null;
  const senderName = selectedBrand?.name ?? "All Brands";
  const senderAddress = selectedBrand?.address;
  const brandLabel = selectedBrand?.name ?? "All brands";
  const periodLabel = `${fyLabel(startYear)} · ${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;

  const canGenerate = rangeValid && hasStatus && filtered.length > 0;

  const revokePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  };

  const resetAndClose = (isOpen: boolean) => {
    if (!isOpen) {
      revokePreview();
      setStep("config");
    }
    setOpen(isOpen);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const summary = summarize(filtered);
      const doc = (
        <SummaryReportPDF
          invoices={filtered}
          summary={summary}
          periodLabel={periodLabel}
          senderName={senderName}
          senderAddress={senderAddress}
          generatedOn={format(new Date(), "dd MMM yyyy")}
        />
      );
      const blob = await pdf(doc).toBlob();
      revokePreview();
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStep("preview");
    } catch {
      toast("Failed to generate the report. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmDownload = () => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary-${fyLabel(startYear).replace(/\s+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    resetAndClose(false);
  };

  const toggleStatus = (value: InvoiceStatus) =>
    setStatuses((prev) => ({ ...prev, [value]: !prev[value] }));

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={() => setOpen(true)}
      >
        <FileBarChart className="h-3.5 w-3.5" />
        Summary Report
      </Button>

      <Dialog open={open} onOpenChange={resetAndClose}>
        <DialogContent className={step === "preview" ? "max-w-3xl" : "max-w-md"}>
          {step === "config" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm">Financial Year Summary</DialogTitle>
                <DialogDescription className="text-xs">
                  Choose a financial year and month range to summarise your invoices.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Financial year */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Financial Year</Label>
                  <Select
                    value={String(startYear)}
                    onValueChange={(v) => setStartYear(Number(v))}
                  >
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fyOptions.map((f) => (
                        <SelectItem key={f.startYear} value={String(f.startYear)} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Month range */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From Month</Label>
                    <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
                      <SelectTrigger className="w-full text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FY_MONTHS.map((m) => (
                          <SelectItem key={m.month} value={String(m.month)} className="text-xs">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To Month</Label>
                    <Select value={String(toMonth)} onValueChange={(v) => setToMonth(Number(v))}>
                      <SelectTrigger className="w-full text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FY_MONTHS.map((m) => (
                          <SelectItem key={m.month} value={String(m.month)} className="text-xs">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!rangeValid && (
                  <p className="text-xs text-destructive">
                    &ldquo;From&rdquo; month must come before &ldquo;To&rdquo; month in the financial year.
                  </p>
                )}

                {/* Brand */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Brand</Label>
                  <Select value={brandId} onValueChange={setBrandId}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All brands</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="text-xs">
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Statuses */}
                <div className="space-y-2">
                  <Label className="text-xs">Include Statuses</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_STATUSES.map((s) => (
                      <label
                        key={s.value}
                        className="flex items-center gap-2 text-xs cursor-pointer"
                      >
                        <Checkbox
                          checked={statuses[s.value]}
                          onCheckedChange={() => toggleStatus(s.value)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                  {!hasStatus && (
                    <p className="text-xs text-destructive">Select at least one status.</p>
                  )}
                </div>

                {/* Result hint */}
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  {!rangeValid || !hasStatus ? (
                    <p className="text-xs text-muted-foreground">
                      Adjust the filters above to preview a report.
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No invoices match these filters.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">
                        {filtered.length}
                      </span>{" "}
                      invoice{filtered.length === 1 ? "" : "s"} will be included.
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={!canGenerate || generating}
                  onClick={handleGenerate}
                >
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm">Report Preview</DialogTitle>
                <DialogDescription className="text-xs">
                  {periodLabel} · {brandLabel}
                </DialogDescription>
              </DialogHeader>

              <div className="h-[65vh] w-full overflow-hidden rounded-md border bg-muted/30">
                {previewUrl && (
                  <iframe
                    src={previewUrl}
                    className="h-full w-full"
                    title="Report preview"
                  />
                )}
              </div>

              <DialogFooter className="sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    revokePreview();
                    setStep("config");
                  }}
                >
                  Back
                </Button>
                <Button size="sm" className="text-xs" onClick={handleConfirmDownload}>
                  Confirm &amp; Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function monthLabel(month: number): string {
  return FY_MONTHS.find((m) => m.month === month)?.label ?? "";
}
