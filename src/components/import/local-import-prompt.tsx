"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { prepareImport, writeImport } from "@/lib/import-pipeline";
import { ImportSummaryView, type ImportSummaryData } from "@/components/import/import-summary-view";
import {
  readLocalCollections,
  localInvoiceCount,
  isImportPromptDismissed,
  dismissImportPrompt,
  clearLocalCollections,
} from "@/lib/local-data";

/**
 * Whether any part of a completed import didn't actually persist —
 * per-record write failures `writeImport` counts rather than throws (a full
 * storage quota, a rejected insert). Offering "Clear local copy" here would
 * delete the only surviving copy of a record that never made it to the
 * account, so it's withheld whenever this is true, not just while the stage
 * is "failed" (which only covers a hard rejection before any summary
 * exists).
 */
function hasWriteFailures(summary: ImportSummaryData): boolean {
  return (
    summary.invoices.failed > 0 ||
    (summary.brands?.failed ?? 0) > 0 ||
    (summary.clients?.failed ?? 0) > 0 ||
    (summary.templates?.failed ?? 0) > 0
  );
}

type Stage =
  | { name: "asking" }
  | { name: "importing" }
  | { name: "done"; summary: ImportSummaryData }
  | { name: "failed"; error: string };

/**
 * One-time offer to bring data left behind by the local-only build into the
 * signed-in account. Nothing here writes an `invoicer_*` data key except the
 * "Clear local copy" button, and that button is only ever reachable once the
 * result of a successful import is already on screen — see the doc comment
 * on `clearLocalCollections` in `@/lib/local-data`.
 */
export function LocalImportPrompt() {
  /**
   * Read ONCE, in an initialiser. Re-reading `readLocalCollections()` (or
   * dismissal) on every render means clearing the local copy — which
   * changes what that read would now return — re-evaluates mid-interaction
   * and the dialog (with the summary the user is still reading) vanishes
   * out from under them.
   */
  const [initial] = useState(() => ({
    collections: readLocalCollections(),
    count: localInvoiceCount(),
    dismissed: isImportPromptDismissed(),
  }));

  const [stage, setStage] = useState<Stage>({ name: "asking" });
  const [open, setOpen] = useState(true);
  const [cleared, setCleared] = useState(false);

  if (!initial.collections || initial.dismissed) return null;

  const handleImport = async () => {
    setStage({ name: "importing" });

    const prepared = prepareImport(initial.collections);
    if (!prepared.ok) {
      setStage({ name: "failed", error: prepared.error });
      return;
    }

    try {
      // No `onConflict`: this device's own local data importing into a
      // fresh account is not expected to collide with anything already
      // there. See the report for what `writeImport` does with no resolver
      // when it does collide.
      const summary = await writeImport(prepared.collections, {
        remappedIds: prepared.remappedIds,
      });
      setStage({ name: "done", summary });
    } catch (err) {
      setStage({
        name: "failed",
        error: err instanceof Error ? err.message : "Import failed for an unknown reason",
      });
    }
  };

  const handleNotNow = () => {
    dismissImportPrompt();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleNotNow()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {stage.name === "done"
              ? "Imported"
              : `We found ${initial.count} invoices on this device`}
          </DialogTitle>
          {stage.name === "asking" && (
            <DialogDescription>
              They were saved by the earlier version of Invoicer, which kept everything in this
              browser. Import them into your account? Your local copy stays where it is either
              way.
            </DialogDescription>
          )}
        </DialogHeader>

        {stage.name === "failed" && (
          <p className="text-sm text-destructive">
            Import failed — {stage.error}. Nothing on this device was changed, so you can try
            again.
          </p>
        )}

        {stage.name === "done" && <ImportSummaryView summary={stage.summary} />}

        <DialogFooter>
          {stage.name === "asking" && (
            <>
              <Button variant="ghost" onClick={handleNotNow}>
                Not now
              </Button>
              <Button
                onClick={() => {
                  handleImport().catch(() => {
                    // handleImport already catches every rejection from
                    // writeImport itself; this only guards a bug in the
                    // handler from surfacing as an unhandled rejection.
                  });
                }}
              >
                Import them
              </Button>
            </>
          )}

          {stage.name === "importing" && <Button disabled>Importing…</Button>}

          {/* Only offered once the result is on screen, and only when
              nothing failed to write — deleting someone's only copy on the
              strength of an upload nobody has looked at (or one that only
              partly landed) is not a risk worth taking. */}
          {stage.name === "done" && !cleared && !hasWriteFailures(stage.summary) && (
            <Button
              variant="outline"
              onClick={() => {
                clearLocalCollections();
                setCleared(true);
              }}
            >
              Clear local copy
            </Button>
          )}

          {stage.name !== "asking" && stage.name !== "importing" && (
            <Button onClick={handleNotNow}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
