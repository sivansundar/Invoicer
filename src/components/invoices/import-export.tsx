"use client";

import { useRef, useState } from "react";
import { Invoice } from "@/lib/types";
import {
  getInvoices,
  saveInvoice,
  deleteInvoice,
  getBrands,
  saveBrand,
  getClients,
  saveClient,
} from "@/lib/storage";
import {
  validateImportedInvoices,
  validateImportedBackup,
  type CollectionValidation,
} from "@/lib/import-validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PendingConflict {
  incoming: Invoice;
  existing: Invoice;
}

type ConflictResolution =
  | { action: "overwrite" }
  | { action: "rename"; newNumber: string }
  | { action: "discard" };

interface InvoiceImportSummary {
  /** Invoices actually persisted this run — new writes, overwrites, and renames combined. */
  imported: number;
  overwritten: number;
  renamed: number;
  /** User chose "Discard" on a conflicting invoice number. */
  skipped: number;
  /** Records in the file that were not objects, or lacked a field a rendering screen depends on. */
  invalidSkipped: number;
  /** A write that was attempted but did not persist (e.g. a full localStorage quota). */
  failed: number;
}

/**
 * Brands and clients have no per-record conflict dialog the way invoices
 * do — a record whose `id` already exists locally is always skipped, never
 * overwritten, so this is the whole result for one of those collections.
 * `null` (not this shape) distinguishes "this was a legacy invoices-only
 * import" from "this was a full backup with zero of this collection in
 * it" — the former hides the section entirely, the latter would show a row
 * of zeroes.
 */
interface CollectionImportResult {
  imported: number;
  /** Already present locally by `id` (or a duplicate `id` within the file itself) — never overwritten. */
  skippedExisting: number;
  invalidSkipped: number;
  /** The collection's value in the file wasn't an array at all — the whole section, not one record. */
  invalidShape: boolean;
  failed: number;
}

interface ImportedCollections {
  brands: CollectionImportResult | null;
  clients: CollectionImportResult | null;
}

interface ImportSummary extends ImportedCollections {
  invoices: InvoiceImportSummary;
}

const EMPTY_COLLECTIONS: ImportedCollections = { brands: null, clients: null };

/**
 * Writes one collection (brands or clients) from an imported backup.
 * Deliberately has no conflict dialog the way invoices do — an imported
 * record whose `id` already exists locally (or repeats one already seen
 * earlier in this same file) is skipped, never overwritten. Restoring into
 * an empty app (nothing to conflict with) imports everything; merging a
 * backup into a populated app never clobbers a local edit. Every skip and
 * every failed write is counted, never silently dropped.
 */
function importCollection<T extends { id: string }>(
  validation: CollectionValidation<T>,
  existingIds: Set<string>,
  save: (item: T) => boolean
): CollectionImportResult {
  const seenThisBatch = new Set<string>();
  let imported = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const item of validation.valid) {
    if (existingIds.has(item.id) || seenThisBatch.has(item.id)) {
      skippedExisting++;
      continue;
    }
    seenThisBatch.add(item.id);
    if (save(item)) imported++;
    else failed++;
  }

  return {
    imported,
    skippedExisting,
    invalidSkipped: validation.skipped,
    invalidShape: validation.invalidShape,
    failed,
  };
}

export function ImportExport({ onImportDone }: { onImportDone: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nonConflicting, setNonConflicting] = useState<Invoice[]>([]);
  const [conflicts, setConflicts] = useState<PendingConflict[]>([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  // Records in the file that failed invoice validation, held here so the
  // final summary (built after conflict resolution, which can take several
  // dialog round-trips) can still report them.
  const [pendingInvalidSkipped, setPendingInvalidSkipped] = useState(0);
  // Brands/clients are written before the invoice conflict dialog is ever
  // shown (see `beginInvoiceReconciliation`), but the summary for them can
  // only be shown once alongside the invoice summary — held here in the
  // meantime.
  const [pendingCollections, setPendingCollections] =
    useState<ImportedCollections>(EMPTY_COLLECTIONS);

  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const handleExport = () => {
    // A full backup, not just invoices — this app has no server and no
    // other backup, so this file is the only copy of a brand's bank
    // details and every saved client, not just invoices. `version` /
    // `exportedAt` match the envelope the parallel v2 rewrite branch
    // already ships (it simply omits `templates`, which this codebase
    // doesn't have) so a file exported here still imports cleanly after
    // that branch merges, and vice versa. Existing `invoices-<date>.json`
    // files (a bare array, no envelope) predate this and are still read by
    // `handleFileChange`'s legacy path below, unaffected by this change.
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      brands: getBrands(),
      clients: getClients(),
      invoices: getInvoices(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoicer-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Shared by the legacy bare-array path and the full-backup envelope path
   * once brands/clients (if any) have already been written — exactly the
   * invoice conflict-detection and dialog flow this component had before
   * full backups existed, untouched in behaviour either way.
   */
  const beginInvoiceReconciliation = (
    incoming: Invoice[],
    invalidSkipped: number,
    collections: ImportedCollections
  ) => {
    setPendingInvalidSkipped(invalidSkipped);
    setPendingCollections(collections);

    const existing = getInvoices();
    const existingByNumber = new Map(
      existing.map((inv) => [inv.invoiceNumber, inv])
    );

    const newConflicts: PendingConflict[] = [];
    const newNonConflicting: Invoice[] = [];

    for (const inv of incoming) {
      const match = existingByNumber.get(inv.invoiceNumber);
      if (match) {
        newConflicts.push({ incoming: inv, existing: match });
      } else {
        newNonConflicting.push(inv);
      }
    }

    setNonConflicting(newNonConflicting);
    setConflicts(newConflicts);
    setResolutions([]);
    setConflictIndex(0);
    setRenameMode(false);
    setRenameValue("");

    if (newConflicts.length > 0) {
      setShowConflictDialog(true);
    } else {
      let saved = 0;
      let failed = 0;
      for (const inv of newNonConflicting) {
        if (saveInvoice(inv)) saved++;
        else failed++;
      }

      finishImport({
        invoices: {
          imported: saved,
          overwritten: 0,
          renamed: 0,
          skipped: 0,
          invalidSkipped,
          failed,
        },
        ...collections,
      });
    }
  };

  /** The legacy shape: a bare `Invoice[]` array, exactly what every existing `invoices-<date>.json` file on disk already is. */
  const importLegacyInvoiceArray = (parsed: unknown[]) => {
    const result = validateImportedInvoices(parsed);
    if (!result.ok) {
      alert(
        "Failed to import — expected a JSON array of invoices. Nothing was imported."
      );
      return;
    }

    const { valid: incoming, skipped: invalidSkipped } = result;
    if (incoming.length === 0) {
      alert(
        invalidSkipped > 0
          ? `Nothing to import — all ${invalidSkipped} record${invalidSkipped === 1 ? "" : "s"} in the file were invalid or missing required fields.`
          : "Nothing to import — the file was empty."
      );
      return;
    }

    beginInvoiceReconciliation(incoming, invalidSkipped, EMPTY_COLLECTIONS);
  };

  /** The full-backup envelope shape: `{ version, exportedAt, brands, clients, invoices }`. */
  const importBackupEnvelope = (parsed: unknown) => {
    const result = validateImportedBackup(parsed);
    if (!result.ok) {
      alert(
        "Failed to import — expected an Invoicer backup file. Nothing was imported."
      );
      return;
    }

    const { brands, clients, invoices } = result;
    const totalValid =
      brands.valid.length + clients.valid.length + invoices.valid.length;

    if (totalValid === 0) {
      const anythingRejected =
        brands.skipped + clients.skipped + invoices.skipped > 0 ||
        brands.invalidShape ||
        clients.invalidShape ||
        invoices.invalidShape;
      alert(
        anythingRejected
          ? "Nothing to import — every record in the file was invalid, missing required fields, or in an unreadable section."
          : "Nothing to import — the file was empty."
      );
      return;
    }

    // Written before invoices are even looked at, so an imported invoice's
    // brandId resolves against a brand that already exists by the time
    // anything reads it.
    const brandsResult = importCollection(
      brands,
      new Set(getBrands().map((b) => b.id)),
      saveBrand
    );
    const clientsResult = importCollection(
      clients,
      new Set(getClients().map((c) => c.id)),
      saveClient
    );
    const collections: ImportedCollections = {
      brands: brandsResult,
      clients: clientsResult,
    };

    if (invoices.valid.length === 0) {
      // Nothing invoice-shaped in the file — finish here rather than run an
      // empty conflict pipeline.
      finishImport({
        invoices: {
          imported: 0,
          overwritten: 0,
          renamed: 0,
          skipped: 0,
          invalidSkipped: invoices.skipped,
          failed: 0,
        },
        ...collections,
      });
      return;
    }

    beginInvoiceReconciliation(invoices.valid, invoices.skipped, collections);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.target?.result as string);
      } catch {
        alert(
          "Failed to import — the file is not valid JSON. Nothing was imported."
        );
        return;
      }

      // A bare array is the legacy invoices-only shape every export on
      // disk already is — routed to the untouched invoices-only pipeline
      // below so those files keep working exactly as they always have.
      // Anything else is validated as a full-backup envelope.
      if (Array.isArray(parsed)) {
        importLegacyInvoiceArray(parsed);
      } else {
        importBackupEnvelope(parsed);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /** Shared by every finishing path above — surfaces a write failure honestly rather than letting the summary dialog quietly claim success. */
  const finishImport = (result: ImportSummary) => {
    setSummary(result);
    setShowSummary(true);

    const failureParts: string[] = [];
    if (result.invoices.failed > 0) {
      const attempted = result.invoices.imported + result.invoices.failed;
      failureParts.push(
        `${result.invoices.failed} of ${attempted} invoice${attempted === 1 ? "" : "s"}`
      );
    }
    if (result.brands && result.brands.failed > 0) {
      failureParts.push(
        `${result.brands.failed} brand${result.brands.failed === 1 ? "" : "s"}`
      );
    }
    if (result.clients && result.clients.failed > 0) {
      failureParts.push(
        `${result.clients.failed} client${result.clients.failed === 1 ? "" : "s"}`
      );
    }

    if (failureParts.length > 0) {
      alert(
        `Import finished, but ${failureParts.join(", ")} couldn't be saved — storage may be full. Free up space and try again.`
      );
    }
    onImportDone();
  };

  const applyResolution = (resolution: ConflictResolution) => {
    const newResolutions = [...resolutions, resolution];

    if (conflictIndex < conflicts.length - 1) {
      setResolutions(newResolutions);
      setConflictIndex(conflictIndex + 1);
      setRenameMode(false);
      setRenameValue("");
    } else {
      setShowConflictDialog(false);

      let saved = 0;
      let failed = 0;
      for (const inv of nonConflicting) {
        if (saveInvoice(inv)) saved++;
        else failed++;
      }

      let overwritten = 0;
      let renamed = 0;
      let skipped = 0;

      for (let i = 0; i < conflicts.length; i++) {
        const { incoming, existing } = conflicts[i];
        const res = newResolutions[i];

        if (res.action === "overwrite") {
          // Save the incoming record before deleting the existing one —
          // this is a deliberate reorder from the app's pre-backup
          // behaviour (which deleted first, then saved). If the save fails
          // (e.g. a full quota), the existing invoice is still there rather
          // than being deleted out from under a write that never landed.
          // The narrow trade-off: if the save succeeds but the delete then
          // fails, storage briefly holds two invoices sharing this
          // invoiceNumber under different ids, and it's counted as
          // `failed` even though a write did land — low likelihood, since
          // the delete's payload is strictly smaller than the write that
          // just succeeded, and preferable to the silent-deletion risk of
          // the old order.
          if (!saveInvoice(incoming)) {
            failed++;
            continue;
          }
          if (existing.id !== incoming.id && !deleteInvoice(existing.id)) {
            failed++;
            continue;
          }
          overwritten++;
        } else if (res.action === "rename") {
          if (saveInvoice({ ...incoming, invoiceNumber: res.newNumber })) {
            renamed++;
          } else {
            failed++;
          }
        } else {
          skipped++;
        }
      }

      finishImport({
        invoices: {
          imported: saved + overwritten + renamed,
          overwritten,
          renamed,
          skipped,
          invalidSkipped: pendingInvalidSkipped,
          failed,
        },
        ...pendingCollections,
      });
    }
  };

  const resetConflictState = () => {
    setConflicts([]);
    setNonConflicting([]);
    setResolutions([]);
    setConflictIndex(0);
    setRenameMode(false);
    setRenameValue("");
  };

  const currentConflict = conflicts[conflictIndex];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={handleExport}
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>

      {/* Conflict Resolution Dialog */}
      {currentConflict && (
        <Dialog
          open={showConflictDialog}
          onOpenChange={(open) => {
            if (!open) resetConflictState();
            setShowConflictDialog(open);
          }}
        >
          <DialogContent className="max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="text-sm">
                Invoice Already Exists
              </DialogTitle>
              <DialogDescription className="text-xs">
                Conflict {conflictIndex + 1} of {conflicts.length} — choose how
                to handle this duplicate.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Invoice number{" "}
                <span className="font-mono font-semibold text-foreground">
                  {currentConflict.incoming.invoiceNumber}
                </span>{" "}
                already exists in your account.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Existing
                  </p>
                  <p className="text-xs font-medium">
                    {currentConflict.existing.invoiceNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentConflict.existing.client.companyName}
                  </p>
                  <p className="text-xs tabular-nums">
                    {formatCurrency(
                      currentConflict.existing.total,
                      currentConflict.existing.currency ?? "INR"
                    )}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {currentConflict.existing.status}
                  </p>
                </div>
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Incoming
                  </p>
                  <p className="text-xs font-medium">
                    {currentConflict.incoming.invoiceNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentConflict.incoming.client.companyName}
                  </p>
                  <p className="text-xs tabular-nums">
                    {formatCurrency(
                      currentConflict.incoming.total,
                      currentConflict.incoming.currency ?? "INR"
                    )}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {currentConflict.incoming.status}
                  </p>
                </div>
              </div>

              {renameMode && (
                <div className="space-y-1.5">
                  <Label className="text-xs">New Invoice Number</Label>
                  <div className="flex gap-2">
                    <Input
                      className="text-xs h-8"
                      placeholder="e.g. INV-042"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameValue.trim()) {
                          applyResolution({
                            action: "rename",
                            newNumber: renameValue.trim(),
                          });
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={!renameValue.trim()}
                      onClick={() =>
                        applyResolution({
                          action: "rename",
                          newNumber: renameValue.trim(),
                        })
                      }
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => {
                        setRenameMode(false);
                        setRenameValue("");
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {!renameMode && (
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => applyResolution({ action: "discard" })}
                >
                  Discard
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setRenameMode(true);
                      setRenameValue(currentConflict.incoming.invoiceNumber);
                    }}
                  >
                    Change Number
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    onClick={() => applyResolution({ action: "overwrite" })}
                  >
                    Overwrite
                  </Button>
                </div>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Import Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Import Complete</DialogTitle>
            <DialogDescription className="text-xs">
              Here&apos;s a summary of what was imported.
            </DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Invoices imported</span>
                <span className="font-semibold tabular-nums">
                  {summary.invoices.imported}
                </span>
              </div>
              {summary.invoices.overwritten > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overwritten</span>
                  <span className="tabular-nums">
                    {summary.invoices.overwritten}
                  </span>
                </div>
              )}
              {summary.invoices.renamed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renamed</span>
                  <span className="tabular-nums">{summary.invoices.renamed}</span>
                </div>
              )}
              {summary.invoices.skipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Skipped (duplicate)
                  </span>
                  <span className="tabular-nums">{summary.invoices.skipped}</span>
                </div>
              )}
              {summary.invoices.invalidSkipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Skipped (invalid)
                  </span>
                  <span className="tabular-nums">
                    {summary.invoices.invalidSkipped}
                  </span>
                </div>
              )}
              {summary.invoices.failed > 0 && (
                <div className="flex justify-between">
                  <span className="text-destructive">Failed to save</span>
                  <span className="tabular-nums text-destructive">
                    {summary.invoices.failed}
                  </span>
                </div>
              )}

              <CollectionSummaryRows label="Brands" result={summary.brands} />
              <CollectionSummaryRows label="Clients" result={summary.clients} />
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => setShowSummary(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * One collection's rows in the import summary dialog. Renders nothing for a
 * legacy invoices-only import (`result === null`) and nothing for a full
 * backup that genuinely had zero of this collection *and* nothing rejected
 * either — every other outcome (imported, skipped for any reason, or an
 * unreadable section) gets an explicit, honest line.
 */
function CollectionSummaryRows({
  label,
  result,
}: {
  label: string;
  result: CollectionImportResult | null;
}) {
  if (!result) return null;

  const hasAnythingToShow =
    result.imported > 0 ||
    result.skippedExisting > 0 ||
    result.invalidSkipped > 0 ||
    result.invalidShape ||
    result.failed > 0;
  if (!hasAnythingToShow) return null;

  return (
    <>
      <div className="flex justify-between py-1 border-b">
        <span className="text-muted-foreground">{label} imported</span>
        <span className="font-semibold tabular-nums">{result.imported}</span>
      </div>
      {result.skippedExisting > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {label} skipped (already exist)
          </span>
          <span className="tabular-nums">{result.skippedExisting}</span>
        </div>
      )}
      {result.invalidSkipped > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {label} skipped (invalid)
          </span>
          <span className="tabular-nums">{result.invalidSkipped}</span>
        </div>
      )}
      {result.invalidShape && (
        <div className="flex justify-between">
          <span className="text-destructive">{label} section unreadable</span>
          <span className="tabular-nums text-destructive">skipped</span>
        </div>
      )}
      {result.failed > 0 && (
        <div className="flex justify-between">
          <span className="text-destructive">{label} failed to save</span>
          <span className="tabular-nums text-destructive">{result.failed}</span>
        </div>
      )}
    </>
  );
}
