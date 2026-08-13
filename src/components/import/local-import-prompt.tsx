"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
 * account. Two different ways a record can exist ONLY on this device, both
 * gating the button:
 *
 * - `writeImport` reported it: a discarded invoice (already matched
 *   something in the account) or a failed write (a rejected insert). Both
 *   leave the local copy as the only surviving one.
 * - It never reached `writeImport` at all: `prepareImport`'s validation
 *   skipped it (`skipped`/`invalidShape`), or `readLocalCollections` could
 *   not even parse the key it lived in (`corrupt`). Either way it exists
 *   nowhere but this device, exactly like a discard or a failed write —
 *   `writeImport` simply never got the chance to report it, which is not
 *   the same as it having landed.
 *
 * "Clear local copy" is gated on this being true, because it is the one
 * button in this flow that writes an `invoicer_*` key — offering it any
 * other time would let the same click that was supposed to be tidy-up
 * delete the only surviving copy of something that never made it across.
 */
function importedEverything(summary: ImportSummaryData, corrupt: boolean): boolean {
  return (
    !corrupt &&
    summary.invoices.discarded === 0 &&
    summary.invoices.failed === 0 &&
    (summary.invoices.invalidSkipped ?? 0) === 0 &&
    collectionImportedEverything(summary.brands) &&
    collectionImportedEverything(summary.clients) &&
    collectionImportedEverything(summary.templates)
  );
}

function collectionImportedEverything(
  result: ImportSummaryData["brands"] | ImportSummaryData["clients"] | ImportSummaryData["templates"]
): boolean {
  if (!result) return true;
  return (
    (result.failed ?? 0) === 0 &&
    (result.invalidSkipped ?? 0) === 0 &&
    (result.invalidShape ?? false) === false
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
  const queryClient = useQueryClient();

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

  const corruptKeys = initial.collections.corruptKeys;
  const corrupt = corruptKeys.length > 0;

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
      const result = await writeImport(prepared.collections, {
        remappedIds: prepared.remappedIds,
        onConflict: () => ({ action: "discard" }),
      });

      // `writeImport` only ever sees what survived `prepareImport`'s
      // validation — it has no way to know what was skipped before it was
      // ever called. Reattached here, the same way the file importer's
      // `toCollectionResult` does it, so the summary (and the gate above)
      // account for validation-time losses, not just write-time ones.
      const summary: ImportSummaryData = {
        remappedIds: result.remappedIds,
        invoices: { ...result.invoices, invalidSkipped: prepared.skipped.invoices },
        brands: {
          ...result.brands,
          invalidSkipped: prepared.skipped.brands,
          invalidShape: prepared.invalidShape.brands,
        },
        clients: {
          ...result.clients,
          invalidSkipped: prepared.skipped.clients,
          invalidShape: prepared.invalidShape.clients,
        },
        templates: {
          ...result.templates,
          invalidSkipped: prepared.skipped.templates,
          invalidShape: prepared.invalidShape.templates,
        },
      };

      // The seam this writes through is invisible to `useBrands`/
      // `useInvoices`/`useClients`/`useTemplates` — this bypasses their
      // mutation layer entirely, so nothing else invalidates the cache
      // those hooks read from. Without this, a screen already rendered
      // from an empty (or stale) cache keeps showing it after the import
      // completes, `staleTime` being long enough that nothing would
      // refetch on its own for up to a minute.
      queryClient.invalidateQueries();
      setStage({ name: "done", summary });
    } catch (err) {
      // A fetch inside `writeImport` (e.g. the invoice-conflict lookup)
      // can fail after brands/clients/templates already committed, so the
      // cache may already be stale even on this path.
      queryClient.invalidateQueries();
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

  const askingTitle =
    initial.count > 0
      ? `We found ${initial.count} invoice${initial.count === 1 ? "" : "s"} on this device`
      : "We found data on this device";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-import (ESC, the overlay, or the close button all
        // route here) would dismiss the prompt permanently — see
        // `handleNotNow` — before the result has even rendered. Nothing on
        // this device is deleted by an import that's cut off early, but the
        // report of what happened (including any failures) would never be
        // shown, and the user would have no way to bring the prompt back.
        if (!next && stage.name !== "importing") handleNotNow();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage.name === "done" ? "Imported" : askingTitle}</DialogTitle>
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
            {corrupt && (
              <p className="text-sm text-muted-foreground">
                Some local data ({corruptKeys.join(", ")}) couldn&apos;t be read — it may be
                damaged — so it wasn&apos;t part of this import.
              </p>
            )}
            {/* Explains the absence of "Clear local copy" below, rather than
                leaving the user to notice it's just missing. Whatever
                didn't land — discarded, failed, skipped as invalid during
                validation, or unreadable in the first place — only ever
                existed here, so this is deliberately shown for any of those
                reasons, not just the discard case that made it reachable. */}
            {!importedEverything(stage.summary, corrupt) && (
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
              only partly landed, whether discarded, failed, skipped, or
              unreadable) is not a risk worth taking. */}
          {stage.name === "done" && !cleared && importedEverything(stage.summary, corrupt) && (
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
