"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Invoice } from "@/lib/types";
import {
  getInvoices,
  createInvoice,
  saveInvoice,
  getBrands,
  saveBrand,
  getClients,
  saveClient,
  getTemplates,
  saveTemplate,
} from "@/lib/storage";
import {
  validateImportedInvoices,
  validateImportedBackup,
  type CollectionValidation,
} from "@/lib/import-validation";
import { remapNonUuidIds } from "@/lib/import-remap";
import { migrateToV2 } from "@/lib/migrate";
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
  discarded: number;
  /** Records in the file that were not objects, or lacked a field a rendering screen depends on. */
  invalidSkipped: number;
  /** A write that was attempted but did not persist (e.g. a full localStorage quota). */
  failed: number;
}

/**
 * Brands, clients and templates have no per-record conflict dialog (see the
 * design note above `importCollection` below) — this is the whole result
 * for one of those three collections. `null` (not this shape) is how the
 * summary distinguishes "this was a legacy invoices-only import" from "this
 * was a full backup with zero of this collection in it" — the former hides
 * the section entirely, the latter would show a row of zeroes.
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
  templates: CollectionImportResult | null;
}

interface ImportSummary extends ImportedCollections {
  invoices: InvoiceImportSummary;
  /**
   * Ids rewritten because Postgres would not accept them — see
   * `import-remap.ts`. Surfaced rather than silent, because it has a
   * consequence the user can otherwise only discover by hitting it:
   * re-importing the same legacy file produces a second copy of those
   * records instead of skipping them, since their new ids no longer match
   * what landed the first time.
   */
  remappedIds: number;
}

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
 * Writes one collection (brands, clients, or templates) from an imported
 * backup. Deliberately has no conflict dialog the way invoices do — see the
 * design note in the backup-feature report for the full trade — instead an
 * imported record whose `id` already exists locally (or repeats one already
 * seen earlier in this same file) is skipped, never overwritten. Restoring
 * into an empty app (nothing to conflict with) imports everything; merging
 * an export into a populated app never clobbers a local edit. Every skip and
 * every failed write is counted, never silently dropped.
 */
async function importCollection<T extends { id: string }>(
  validation: CollectionValidation<T>,
  existingIds: Set<string>,
  save: (item: T) => Promise<unknown>
): Promise<CollectionImportResult> {
  const seenThisBatch = new Set<string>();
  let imported = 0;
  let skippedExisting = 0;
  let failed = 0;

  // Sequential rather than Promise.all: a rejected write must be counted,
  // not abort the batch, and the failure count is what the summary reports.
  // Task 8 revisits this whole path for all-or-nothing semantics.
  for (const item of validation.valid) {
    if (existingIds.has(item.id) || seenThisBatch.has(item.id)) {
      skippedExisting++;
      continue;
    }
    seenThisBatch.add(item.id);
    try {
      await save(item);
      imported++;
    } catch {
      failed++;
    }
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

  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const handleExport = async () => {
    const backup = await buildBackup();
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
    const existingByNumber = new Map(existing.map((inv) => [inv.invoiceNumber, inv]));

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
    setExistingNumbers(new Set(existingByNumber.keys()));
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
        // preserveNumber: a restored invoice is not a new document. It may
        // already be in a client's inbox under the number it was issued
        // with, so allocating a fresh one would put the app's records and
        // the customer's out of step.
        try {
          await createInvoice(inv, { preserveNumber: true });
          saved++;
        } catch {
          failed++;
        }
      }

      finishImport({
        invoices: {
          imported: saved,
          overwritten: 0,
          renamed: 0,
          discarded: 0,
          invalidSkipped,
          failed,
        },
        // The parameter, not the state set moments ago in this same
        // function — that setter has not been applied yet, so reading it
        // here would always report zero. Only the conflict-resolution path,
        // which spans dialog round-trips, needs the state version.
        remappedIds,
        ...collections,
      });
    }
  };

  /** The legacy shape: a bare `Invoice[]` array, exactly what every existing `invoices-<date>.json` file on disk already is. */
  const importLegacyInvoiceArray = async (parsed: unknown[]) => {
    const result = validateImportedInvoices(parsed);
    if (!result.ok) {
      toast(
        "Failed to import — expected a JSON array of invoices. Nothing was imported."
      );
      return;
    }

    const { valid: incoming, skipped: invalidSkipped } = result;
    if (incoming.length === 0) {
      toast(
        invalidSkipped > 0
          ? `Nothing to import — all ${invalidSkipped} record${invalidSkipped === 1 ? "" : "s"} in the file were invalid or missing required fields.`
          : "Nothing to import — the file was empty."
      );
      return;
    }

    // Same uuid problem as the envelope path. There are no brands or clients
    // in a legacy file to remap against, so this only rewrites an invoice's
    // own id — its brandId still has to match a brand already in the account,
    // which is what it meant in the file it came from.
    const legacyRemap = remapNonUuidIds({
      brands: [],
      clients: [],
      templates: [],
      invoices: incoming,
    });
    const remapped = legacyRemap.collections;

    await beginInvoiceReconciliation(
      remapped.invoices,
      invalidSkipped,
      EMPTY_COLLECTIONS,
      legacyRemap.remapped
    );
  };

  /** The full-backup envelope shape: `{ version, exportedAt, brands, clients, templates, invoices }`. */
  const importBackupEnvelope = async (parsed: unknown) => {
    const result = validateImportedBackup(parsed);
    if (!result.ok) {
      toast(
        "Failed to import — expected an Invoicer backup file. Nothing was imported."
      );
      return;
    }

    const { brands, clients, templates, invoices } = result;
    const totalValid =
      brands.valid.length + clients.valid.length + templates.valid.length + invoices.valid.length;

    if (totalValid === 0) {
      const anythingRejected =
        brands.skipped + clients.skipped + templates.skipped + invoices.skipped > 0 ||
        brands.invalidShape ||
        clients.invalidShape ||
        templates.invalidShape ||
        invoices.invalidShape;
      toast(
        anythingRejected
          ? "Nothing to import — every record in the file was invalid, missing required fields, or in an unreadable section."
          : "Nothing to import — the file was empty."
      );
      return;
    }

    // Normalise, then remap, then write.
    //
    // `migrateToV2` is what backfills the fields validation deliberately does
    // not require — `accentColor`, `followup`, `brandSnapshot`, `currency`,
    // `reminders`. That used to happen after the import, via `forceMigration`
    // patching the localStorage keys the records had just been written to.
    // With the data in Postgres there is no such second pass: a record
    // missing `currency` now violates a NOT NULL constraint and is dropped.
    // Normalising before the write is what keeps those records importable.
    const normalised = migrateToV2({
      brands: brands.valid,
      clients: clients.valid,
      invoices: invoices.valid,
      templates: templates.valid,
    });

    // `currency` is the one field neither validation nor migrateToV2 fills.
    // The app has always tolerated its absence by defaulting at read time
    // (`invoice.currency ?? "INR"` in reports.ts and invoice-table.ts), which
    // worked while nothing enforced it. The column is NOT NULL, so an
    // invoice without one is now rejected outright — applied here, at the
    // one place unvalidated external JSON enters, rather than in the mapper,
    // where it would quietly paper over a bug in our own code.
    const withCurrency = normalised.invoices.map((invoice) =>
      invoice.currency ? invoice : { ...invoice, currency: "INR" as const }
    );

    // `migrateToV2` seeds the three default templates when it is handed none
    // — right for a first-run migration, wrong for an import, where it would
    // add templates the user's file never contained. Every new account
    // already gets them from the signup trigger.
    const normalisedTemplates = templates.valid.length === 0 ? [] : normalised.templates;

    // Every id column is `uuid`, and a backup written by the pre-Postgres
    // app carries hand-written template ids (`tpl-gentle-nudge`) that
    // Postgres rejects outright. Remapping runs after normalisation and
    // before any write, so the references between records in the file are
    // rewritten together rather than one collection at a time.
    const remap = remapNonUuidIds({
      brands: normalised.brands,
      clients: normalised.clients,
      templates: normalisedTemplates,
      invoices: withCurrency,
    });

    // Written before invoices are even looked at, so an imported invoice's
    // brandId/clientId resolve against records that already exist by the
    // time forceMigration (and every screen after it) reads them.
    const [existingBrands, existingClients, existingTemplates] = await Promise.all([
      getBrands(),
      getClients(),
      getTemplates(),
    ]);
    const brandsResult = await importCollection(
      { ...brands, valid: remap.collections.brands },
      new Set(existingBrands.map((b) => b.id)),
      saveBrand
    );
    const clientsResult = await importCollection(
      { ...clients, valid: remap.collections.clients },
      new Set(existingClients.map((c) => c.id)),
      saveClient
    );
    const templatesResult = await importCollection(
      { ...templates, valid: remap.collections.templates },
      new Set(existingTemplates.map((t) => t.id)),
      saveTemplate
    );
    const collections: ImportedCollections = {
      brands: brandsResult,
      clients: clientsResult,
      templates: templatesResult,
    };

    if (invoices.valid.length === 0) {
      // Nothing invoice-shaped in the file — finish here rather than run an
      // empty conflict pipeline.
      finishImport({
        invoices: {
          imported: 0,
          overwritten: 0,
          renamed: 0,
          discarded: 0,
          invalidSkipped: invoices.skipped,
          failed: 0,
        },
        remappedIds: remap.remapped,
        ...collections,
      });
      return;
    }

    await beginInvoiceReconciliation(
      remap.collections.invoices,
      invoices.skipped,
      collections,
      remap.remapped
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

      let saved = 0;
      let failed = 0;
      for (const inv of nonConflicting) {
        try {
          await createInvoice(inv, { preserveNumber: true });
          saved++;
        } catch {
          failed++;
        }
      }

      let overwritten = 0;
      let renamed = 0;
      let discarded = 0;

      for (let i = 0; i < conflicts.length; i++) {
        const { incoming, existing } = conflicts[i];
        const res = newResolutions[i];

        if (res.action === "overwrite") {
          // Overwrite the existing row in place, keeping its id, rather than
          // inserting the incoming record and deleting the old one.
          //
          // The conflict was detected BY invoice number, so both rows carry
          // the same one — and `invoices_number_unique` will not hold two.
          // Insert-then-delete is therefore impossible, and delete-then-
          // insert would leave nothing at all if the insert failed. Updating
          // in place is a single transaction with no window where the
          // invoice is missing. Nothing references an invoice's id, so
          // discarding the incoming one costs nothing.
          try {
            await saveInvoice({ ...incoming, id: existing.id });
            overwritten++;
          } catch {
            failed++;
          }
        } else if (res.action === "rename") {
          try {
            await createInvoice(
              { ...incoming, invoiceNumber: res.newNumber },
              { preserveNumber: true }
            );
            renamed++;
          } catch {
            failed++;
          }
        } else {
          discarded++;
        }
      }

      finishImport({
        invoices: {
          imported: saved + overwritten + renamed,
          overwritten,
          renamed,
          discarded,
          invalidSkipped: pendingInvalidSkipped,
          failed,
        },
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
        onClick={() => {
          handleExport().catch((err: unknown) => {
            toast(
              err instanceof Error
                ? `Export failed — ${err.message}`
                : "Export failed. Nothing was downloaded."
            );
          });
        }}
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
          {summary && (
            <div className="space-y-2 text-xs">
              {summary.remappedIds > 0 && (
                <p className="text-muted-foreground border rounded-md p-2 leading-relaxed">
                  {summary.remappedIds} record
                  {summary.remappedIds === 1 ? " had its id" : "s had their ids"} rewritten —
                  this file predates hosted storage. Importing it again would add a second copy
                  rather than skipping them.
                </p>
              )}
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Invoices imported</span>
                <span className="font-semibold tabular-nums">
                  {summary.invoices.imported}
                </span>
              </div>
              {summary.invoices.overwritten > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overwritten</span>
                  <span className="tabular-nums">{summary.invoices.overwritten}</span>
                </div>
              )}
              {summary.invoices.renamed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renamed</span>
                  <span className="tabular-nums">{summary.invoices.renamed}</span>
                </div>
              )}
              {summary.invoices.discarded > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discarded (duplicate)</span>
                  <span className="tabular-nums">{summary.invoices.discarded}</span>
                </div>
              )}
              {summary.invoices.invalidSkipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped (invalid)</span>
                  <span className="tabular-nums">{summary.invoices.invalidSkipped}</span>
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
              <CollectionSummaryRows label="Templates" result={summary.templates} />
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
          <span className="text-muted-foreground">{label} skipped (invalid)</span>
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
