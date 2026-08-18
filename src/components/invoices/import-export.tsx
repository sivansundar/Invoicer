"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useExportBackup } from "./use-export-backup";
import { Invoice } from "@/lib/types";
import { getInvoices, getBrands, getClients, getTemplates } from "@/lib/storage";
import {
  prepareImport,
  writeImport,
  conflictKey,
  type ImportCollections,
  type CollectionWriteResult,
  type PendingConflict,
  type ConflictResolution,
} from "@/lib/import-pipeline";
import {
  ImportSummaryView,
  type CollectionSummaryData,
  type ImportSummaryData,
} from "@/components/import/import-summary-view";
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

/**
 * The dialog's own summary types, built on the shared `ImportSummaryView`'s
 * — this adds the invalid/legacy-hiding wrinkles a caller with an
 * interactive conflict dialog needs and a headless caller (the one-time
 * local-data prompt) does not: `null` (not a zeroed-out shape) is how the
 * summary distinguishes "this was a legacy invoices-only import" from "this
 * was a full backup with zero of this collection in it" — the former hides
 * the section entirely, the latter would show a row of zeroes.
 */
type CollectionImportResult = CollectionSummaryData;

interface ImportedCollections {
  brands: CollectionImportResult | null;
  clients: CollectionImportResult | null;
  templates: CollectionImportResult | null;
}

type DialogSummary = ImportSummaryData;

const EMPTY_COLLECTIONS: ImportedCollections = { brands: null, clients: null, templates: null };

/**
 * The exported file's contents, separated from downloading it so the format
 * itself can be asserted rather than inferred from a Blob.
 *
 * A full backup, not just invoices: for anyone who has not yet moved to the
 * hosted app this file is the only copy of a brand's bank details and
 * follow-up config, every saved client, and every custom email template.
 * `version`/`exportedAt` let a future format change detect and handle this
 * shape without guessing; existing `invoices-<date>.json` files (a bare
 * array, no envelope) predate this and are still read by the legacy path in
 * `handleFileChange`.
 *
 * The shape is unchanged from the pre-Postgres app on purpose. A file
 * exported then still restores now, and a file exported now still restores
 * into an older build.
 */
export async function buildBackup() {
  const [brands, clients, templates, invoices] = await Promise.all([
    getBrands(),
    getClients(),
    getTemplates(),
    getInvoices(),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    brands,
    clients,
    templates,
    invoices,
  };
}

/**
 * Reattaches the validation-time counts (`invalidSkipped`, `invalidShape`)
 * a single `CollectionWriteResult` from `writeImport` (`@/lib/import-pipeline`)
 * has no way to know, since it is only ever handed records that already
 * passed `prepareImport`'s validation. The write itself — including the
 * skip-rather-than-overwrite behaviour for a record whose `id` already
 * exists — happens in `writeImport`, not here; this is purely a shape
 * conversion so the shared `ImportSummaryView` can render both counts
 * together.
 */
function toCollectionResult(
  write: CollectionWriteResult,
  invalidSkipped: number,
  invalidShape: boolean
): CollectionImportResult {
  return {
    imported: write.imported,
    skippedExisting: write.skippedExisting,
    invalidSkipped,
    invalidShape,
    failed: write.failed,
  };
}

export function ImportExport({ onImportDone }: { onImportDone: () => void }) {
  const { exportBackup, pending: exportPending } = useExportBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nonConflicting, setNonConflicting] = useState<Invoice[]>([]);
  const [conflicts, setConflicts] = useState<PendingConflict[]>([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  // Every invoice number already in storage at the moment the file was
  // parsed — the "rename" resolution below is validated against this (plus
  // already-resolved renames and the batch's own non-conflicting incoming
  // numbers) so typing/confirming a number that's still taken can't create
  // a fresh duplicate, which is exactly the bug the rename dialog exists to
  // prevent.
  const [existingNumbers, setExistingNumbers] = useState<Set<string>>(new Set());
  // Set while a file is being parsed, read again once conflict resolution
  // (which can take several dialog round-trips) finishes and the final
  // summary is built — the validation pass happens once, up front.
  const [pendingInvalidSkipped, setPendingInvalidSkipped] = useState(0);
  // Brands/clients/templates are written before the invoice conflict dialog
  // is ever shown (see `beginInvoiceReconciliation`), but the summary for
  // them can only be shown once alongside the invoice summary — held here in
  // the meantime so a multi-step conflict resolution doesn't lose it.
  const [pendingCollections, setPendingCollections] =
    useState<ImportedCollections>(EMPTY_COLLECTIONS);
  // Held for the same reason as pendingCollections: conflict resolution can
  // take several dialog round-trips before the summary is built.
  const [pendingRemapped, setPendingRemapped] = useState(0);

  const [summary, setSummary] = useState<DialogSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  /**
   * Shared by the legacy bare-array path and the full-backup envelope path
   * once brands/clients/templates (if any) have already been written —
   * exactly the invoice conflict-detection and dialog flow this component
   * had before full backups existed, untouched in behaviour either way.
   */
  const beginInvoiceReconciliation = async (
    incoming: Invoice[],
    invalidSkipped: number,
    collections: ImportedCollections,
    remappedIds: number
  ) => {
    setPendingInvalidSkipped(invalidSkipped);
    setPendingCollections(collections);
    setPendingRemapped(remappedIds);

    const existing = await getInvoices();
    // The same key `writeInvoices` matches on, and the same one
    // `invoices_number_unique` enforces — see `conflictKey`. Keying on the
    // number alone made two brands sharing a prefix look like a conflict,
    // and offered the user an "Overwrite" that would have written across
    // brands.
    const existingByConflictKey = new Map(existing.map((inv) => [conflictKey(inv), inv]));

    const newConflicts: PendingConflict[] = [];
    const newNonConflicting: Invoice[] = [];

    for (const inv of incoming) {
      const match = existingByConflictKey.get(conflictKey(inv));
      if (match) {
        newConflicts.push({ incoming: inv, existing: match });
      } else {
        newNonConflicting.push(inv);
      }
    }

    setNonConflicting(newNonConflicting);
    setConflicts(newConflicts);
    // Independent of `existingByConflictKey` above: a rename target must be
    // free of every existing invoice's number, not just ones sharing the
    // incoming invoice's brand, so this stays keyed on the number alone.
    setExistingNumbers(new Set(existing.map((inv) => inv.invoiceNumber)));
    setResolutions([]);
    setConflictIndex(0);
    setRenameMode(false);
    setRenameValue("");

    if (newConflicts.length > 0) {
      setShowConflictDialog(true);
    } else {
      const result = await writeImport(
        { brands: [], clients: [], templates: [], invoices: newNonConflicting } satisfies ImportCollections,
        // The parameter, not the state set moments ago in this same
        // function — that setter has not been applied yet, so reading it
        // here would always report zero. Only the conflict-resolution path,
        // which spans dialog round-trips, needs the state version.
        { remappedIds }
      );

      finishImport({
        invoices: { ...result.invoices, invalidSkipped },
        remappedIds,
        ...collections,
      });
    }
  };

  /** The legacy shape: a bare `Invoice[]` array, exactly what every existing `invoices-<date>.json` file on disk already is. */
  const importLegacyInvoiceArray = async (parsed: unknown[]) => {
    const prepared = prepareImport(parsed);
    if (!prepared.ok) {
      toast(prepared.error);
      return;
    }

    await beginInvoiceReconciliation(
      prepared.collections.invoices,
      prepared.skipped.invoices,
      EMPTY_COLLECTIONS,
      prepared.remappedIds
    );
  };

  /** The full-backup envelope shape: `{ version, exportedAt, brands, clients, templates, invoices }`. */
  const importBackupEnvelope = async (parsed: unknown) => {
    const prepared = prepareImport(parsed);
    if (!prepared.ok) {
      toast(prepared.error);
      return;
    }

    const { collections: preparedCollections, remappedIds, skipped, invalidShape } = prepared;

    // Written before invoices are even looked at, so an imported invoice's
    // brandId/clientId resolve against records that already exist by the
    // time forceMigration (and every screen after it) reads them.
    const writeResult = await writeImport(
      {
        brands: preparedCollections.brands,
        clients: preparedCollections.clients,
        templates: preparedCollections.templates,
        invoices: [],
      } satisfies ImportCollections,
      { remappedIds }
    );
    const collections: ImportedCollections = {
      brands: toCollectionResult(writeResult.brands, skipped.brands, invalidShape.brands),
      clients: toCollectionResult(writeResult.clients, skipped.clients, invalidShape.clients),
      templates: toCollectionResult(writeResult.templates, skipped.templates, invalidShape.templates),
    };

    if (preparedCollections.invoices.length === 0) {
      // Nothing invoice-shaped in the file — finish here rather than run an
      // empty conflict pipeline.
      finishImport({
        invoices: {
          imported: 0,
          overwritten: 0,
          renamed: 0,
          discarded: 0,
          invalidSkipped: skipped.invoices,
          failed: 0,
        },
        remappedIds,
        ...collections,
      });
      return;
    }

    await beginInvoiceReconciliation(
      preparedCollections.invoices,
      skipped.invoices,
      collections,
      remappedIds
    );
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
        toast("Failed to import — the file is not valid JSON. Nothing was imported.");
        return;
      }

      // A bare array is the legacy invoices-only shape every export on disk
      // already is — routed to the untouched invoices-only pipeline below so
      // those files keep working exactly as they always have. Anything else
      // is validated as a full-backup envelope.
      // Caught rather than left floating: this runs inside FileReader's
      // onload, so nothing above it can await the result, and a rejected
      // write would otherwise surface only as an unhandled rejection.
      const run = Array.isArray(parsed)
        ? importLegacyInvoiceArray(parsed)
        : importBackupEnvelope(parsed);
      run.catch((err: unknown) => {
        toast(
          err instanceof Error
            ? `Import failed — ${err.message}`
            : "Import failed. Nothing was changed."
        );
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /** Shared by every finishing path above — surfaces a write failure honestly rather than letting the summary dialog quietly claim success. */
  const finishImport = (result: DialogSummary) => {
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
      failureParts.push(`${result.brands.failed} brand${result.brands.failed === 1 ? "" : "s"}`);
    }
    if (result.clients && result.clients.failed > 0) {
      failureParts.push(`${result.clients.failed} client${result.clients.failed === 1 ? "" : "s"}`);
    }
    if (result.templates && result.templates.failed > 0) {
      failureParts.push(
        `${result.templates.failed} template${result.templates.failed === 1 ? "" : "s"}`
      );
    }

    if (failureParts.length > 0) {
      toast(
        `Import finished, but ${failureParts.join(", ")} couldn't be saved — storage may be full. Free up space and try again.`
      );
    }
    onImportDone();
  };

  const applyResolution = async (resolution: ConflictResolution) => {
    const newResolutions = [...resolutions, resolution];

    if (conflictIndex < conflicts.length - 1) {
      setResolutions(newResolutions);
      setConflictIndex(conflictIndex + 1);
      setRenameMode(false);
      setRenameValue("");
    } else {
      setShowConflictDialog(false);

      // Every answer is already known at this point — the last dialog
      // round-trip just supplied it — so the resolver `writeImport` calls
      // per conflict is a lookup, not a question. Keyed by object identity
      // rather than invoice number: the same `incoming` references are
      // passed through below, so this can't be fooled by two conflicts
      // that happen to share a number.
      const resolutionByInvoice = new Map(
        conflicts.map((c, i) => [c.incoming, newResolutions[i]] as const)
      );

      const result = await writeImport(
        {
          brands: [],
          clients: [],
          templates: [],
          invoices: [...nonConflicting, ...conflicts.map((c) => c.incoming)],
        },
        {
          remappedIds: pendingRemapped,
          onConflict: ({ incoming }) => resolutionByInvoice.get(incoming)!,
          // The exact pairing shown in the dialog — `existing` included —
          // rather than something `writeImport` re-derives from a fresh
          // `getInvoices()` call. See `writeInvoices` for why: a re-derived
          // match could disagree with what the user actually resolved.
          conflicts,
        }
      );

      finishImport({
        invoices: { ...result.invoices, invalidSkipped: pendingInvalidSkipped },
        remappedIds: pendingRemapped,
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

  // Taken = already in storage, already chosen as a rename earlier in this
  // same batch, or already claimed by one of the batch's own non-conflicting
  // incoming invoices — any of the three would land two invoices under the
  // same number the moment this resolution (plus the rest of the batch) is
  // saved. The prefilled default (the conflicting number itself) always
  // collides via the first check, which is exactly why Confirm must stay
  // disabled until the user actually changes it.
  const trimmedRename = renameValue.trim();
  const renameTaken =
    trimmedRename.length > 0 &&
    (existingNumbers.has(trimmedRename) ||
      resolutions.some((r) => r.action === "rename" && r.newNumber === trimmedRename) ||
      nonConflicting.some((inv) => inv.invoiceNumber === trimmedRename));
  const renameValid = trimmedRename.length > 0 && !renameTaken;

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
        disabled={exportPending}
        onClick={exportBackup}
      >
        <Download className="h-3.5 w-3.5" />
        {exportPending ? "Exporting…" : "Export"}
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
                        if (e.key === "Enter" && renameValid) {
                          applyResolution({
                            action: "rename",
                            newNumber: trimmedRename,
                          });
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={!renameValid}
                      onClick={() =>
                        applyResolution({
                          action: "rename",
                          newNumber: trimmedRename,
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
                  {renameTaken && (
                    <p className="text-xs text-destructive">
                      That invoice number is already in use — choose a different one.
                    </p>
                  )}
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
          {summary && <ImportSummaryView summary={summary} />}
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
