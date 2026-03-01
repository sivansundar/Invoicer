"use client";

import { useRef, useState } from "react";
import { Invoice } from "@/lib/types";
import { getInvoices, saveInvoice, deleteInvoice } from "@/lib/storage";
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
  imported: number;
  overwritten: number;
  renamed: number;
  skipped: number;
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
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!Array.isArray(parsed)) throw new Error("Expected an array");

        const incoming = parsed as Invoice[];
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
          for (const inv of newNonConflicting) {
            saveInvoice(inv);
          }
          setSummary({
            imported: newNonConflicting.length,
            overwritten: 0,
            renamed: 0,
            skipped: 0,
          });
          setShowSummary(true);
          onImportDone();
        }
      } catch {
        alert(
          "Failed to parse file. Please make sure it is a valid invoices JSON export."
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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

      for (const inv of nonConflicting) {
        saveInvoice(inv);
      }

      let overwritten = 0;
      let renamed = 0;
      let skipped = 0;

      for (let i = 0; i < conflicts.length; i++) {
        const { incoming, existing } = conflicts[i];
        const res = newResolutions[i];

        if (res.action === "overwrite") {
          deleteInvoice(existing.id);
          saveInvoice(incoming);
          overwritten++;
        } else if (res.action === "rename") {
          saveInvoice({ ...incoming, invoiceNumber: res.newNumber });
          renamed++;
        } else {
          skipped++;
        }
      }

      setSummary({
        imported: nonConflicting.length + overwritten + renamed,
        overwritten,
        renamed,
        skipped,
      });
      setShowSummary(true);
      onImportDone();
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
              {summary.skipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped</span>
                  <span className="tabular-nums">{summary.skipped}</span>
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
