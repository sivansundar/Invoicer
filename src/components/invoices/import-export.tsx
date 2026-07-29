"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Invoice } from "@/lib/types";
import { getInvoices, saveInvoice, deleteInvoice, forceMigration } from "@/lib/storage";
import { validateImportedInvoices } from "@/lib/import-validation";
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

interface ImportSummary {
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

  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const handleExport = () => {
    const invoices = getInvoices();
    const blob = new Blob([JSON.stringify(invoices, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

      // A payload that isn't even an array (a hand-edited file, or one from
      // an unrelated export) is rejected outright — nothing is written.
      // Anything that *is* an array but has individual malformed records is
      // handled record-by-record below (`validateImportedInvoices` never
      // throws on either shape).
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

      setPendingInvalidSkipped(invalidSkipped);

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
          if (saveInvoice(inv)) saved++;
          else failed++;
        }
        if (saved > 0) forceMigration();

        finishImport({
          imported: saved,
          overwritten: 0,
          renamed: 0,
          discarded: 0,
          invalidSkipped,
          failed,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /** Shared by both the no-conflict and post-conflict-resolution paths — surfaces a write failure honestly rather than letting the summary dialog quietly claim success. */
  const finishImport = (result: ImportSummary) => {
    setSummary(result);
    setShowSummary(true);
    if (result.failed > 0) {
      const attempted = result.imported + result.failed;
      toast(
        `Import finished, but ${result.failed} of ${attempted} invoice${attempted === 1 ? "" : "s"} ` +
          `couldn't be saved — storage may be full. Free up space and try again.`
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
      let discarded = 0;

      for (let i = 0; i < conflicts.length; i++) {
        const { incoming, existing } = conflicts[i];
        const res = newResolutions[i];

        if (res.action === "overwrite") {
          // Save the incoming record before touching the existing one — if
          // the write fails (e.g. a full quota), the existing invoice is
          // still there rather than being deleted out from under a save
          // that never landed.
          if (!saveInvoice(incoming)) {
            failed++;
            continue;
          }
          // If the old record under a different id can't be deleted (e.g. a
          // full quota mid-import), both records now sit in storage under
          // the same invoiceNumber — that's a failed overwrite, not a clean
          // one, even though the new invoice did persist.
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
          discarded++;
        }
      }

      if (saved + overwritten + renamed > 0) forceMigration();

      finishImport({
        imported: saved + overwritten + renamed,
        overwritten,
        renamed,
        discarded,
        invalidSkipped: pendingInvalidSkipped,
        failed,
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
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Total imported</span>
                <span className="font-semibold tabular-nums">
                  {summary.imported}
                </span>
              </div>
              {summary.overwritten > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overwritten</span>
                  <span className="tabular-nums">{summary.overwritten}</span>
                </div>
              )}
              {summary.renamed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renamed</span>
                  <span className="tabular-nums">{summary.renamed}</span>
                </div>
              )}
              {summary.discarded > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discarded (duplicate)</span>
                  <span className="tabular-nums">{summary.discarded}</span>
                </div>
              )}
              {summary.invalidSkipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped (invalid)</span>
                  <span className="tabular-nums">{summary.invalidSkipped}</span>
                </div>
              )}
              {summary.failed > 0 && (
                <div className="flex justify-between">
                  <span className="text-destructive">Failed to save</span>
                  <span className="tabular-nums text-destructive">{summary.failed}</span>
                </div>
              )}
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
