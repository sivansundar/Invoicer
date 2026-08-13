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
 * Whether every record this import touched actually ended up in the
 * account — nothing discarded because it already had a match there, and
 * nothing failed to write (a full storage quota, a rejected insert). Both
 * leave a record that exists ONLY on this device: a discarded invoice was
 * never written anywhere but here, and a failed write never landed either.
 * "Clear local copy" is gated on this being true, because it is the one
 * button in this flow that writes an `invoicer_*` key — offering it any
 * other time would let the same click that was supposed to be tidy-up
 * delete the only surviving copy of something that never made it across.
 */
function importedEverything(summary: ImportSummaryData): boolean {
  return (
    summary.invoices.discarded === 0 &&
    summary.invoices.failed === 0 &&
    (summary.brands?.failed ?? 0) === 0 &&
    (summary.clients?.failed ?? 0) === 0 &&
    (summary.templates?.failed ?? 0) === 0
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
      // This prompt is not a first-run migration — it stays offered until
      // the user dismisses or accepts it, so the account it's importing
      // into is often not fresh: invoices created since signup can already
      // occupy the same numbers this device's local data used. `discard`
      // (never `overwrite`) is the only resolution that can't destroy
      // something real: a discarded invoice is still on this device,
      // untouched, because this flow never deletes the local copy on its
      // own — the same guarantee that makes "Clear local copy" safe to
      // offer only once the user has seen the result. Overwriting would
      // instead let an old browser tab silently clobber an invoice the
      // account has genuinely moved on with.
      const summary = await writeImport(prepared.collections, {
        remappedIds: prepared.remappedIds,
        onConflict: () => ({ action: "discard" }),
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

        {stage.name === "done" && (
          <>
            <ImportSummaryView summary={stage.summary} />
            {/* `writeImport` never overwrites an existing invoice for this
                flow (see the `onConflict` resolver above) — a non-zero
                `discarded` count means some local invoices already have a
                match in the account and were left out, not that anything
                failed. Named explicitly so "Imported" (the dialog title)
                doesn't read as "everything imported" when it wasn't. */}
            {stage.summary.invoices.discarded > 0 && (
              <p className="text-sm text-muted-foreground">
                {stage.summary.invoices.discarded} invoice
                {stage.summary.invoices.discarded === 1 ? "" : "s"} already in your account —
                kept your existing cop{stage.summary.invoices.discarded === 1 ? "y" : "ies"}
                rather than replacing{" "}
                {stage.summary.invoices.discarded === 1 ? "it" : "them"} with the local one.
              </p>
            )}
            {/* Explains the absence of "Clear local copy" below, rather than
                leaving the user to notice it's just missing. Whatever
                didn't land — discarded or failed — only ever existed here,
                so this is deliberately shown for either reason, not just
                the discard case that made it reachable. */}
            {!importedEverything(stage.summary) && (
              <p className="text-sm text-muted-foreground">
                This device may still be the only place some of that lives, so we haven&apos;t
                offered to clear your local copy. It isn&apos;t going anywhere on its own — come
                back and try again, or clear it yourself once you&apos;re sure nothing here is
                missing from your account.
              </p>
            )}
          </>
        )}

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
              EVERY record made it across — deleting someone's only copy on
              the strength of an import nobody has looked at (or one that
              only partly landed, whether discarded or failed) is not a
              risk worth taking. */}
          {stage.name === "done" && !cleared && importedEverything(stage.summary) && (
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
