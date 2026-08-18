import type { CollectionWriteResult, InvoiceWriteResult } from "@/lib/import-pipeline";

/**
 * One collection's write result, plus the validation-time skips a caller
 * with its own file-parsing pass (the file importer) knows about and a
 * headless caller (the one-time local-data prompt) does not — both are
 * optional so `writeImport`'s own `CollectionWriteResult`/`InvoiceWriteResult`
 * satisfy these shapes with no wrapping.
 */
export interface CollectionSummaryData extends CollectionWriteResult {
  invalidSkipped?: number;
  invalidShape?: boolean;
}

export interface InvoiceSummaryData extends InvoiceWriteResult {
  invalidSkipped?: number;
}

/**
 * `null` (not a zeroed-out shape) is how a caller distinguishes "this was a
 * legacy invoices-only import" from "this was a full backup with zero of
 * this collection in it" — the former hides the section entirely, the
 * latter would show a row of zeroes. The one-time local-data prompt has no
 * such distinction (it always has all four collections, even if empty) and
 * passes `writeImport`'s result straight through.
 */
export interface ImportSummaryData {
  remappedIds: number;
  invoices: InvoiceSummaryData;
  brands: CollectionSummaryData | null;
  clients: CollectionSummaryData | null;
  templates: CollectionSummaryData | null;
}

/**
 * The per-record import summary, shared by the file importer
 * (`import-export.tsx`) and the one-time local-data prompt
 * (`local-import-prompt.tsx`) rather than each maintaining its own — the
 * accounting `writeImport` returns (`overwritten`/`renamed`/`discarded` kept
 * distinct, never flattened into one number) is exactly what this exists to
 * show honestly.
 */
export function ImportSummaryView({ summary }: { summary: ImportSummaryData }) {
  return (
    <div className="space-y-2 text-xs">
      {summary.remappedIds > 0 && (
        <p className="text-muted-foreground border rounded-md p-2 leading-relaxed">
          {summary.remappedIds} record
          {summary.remappedIds === 1 ? " had its id" : "s had their ids"} rewritten — this file
          predates hosted storage. Importing it again would add a second copy rather than
          skipping them.
        </p>
      )}
      <div className="flex justify-between py-1 border-b">
        <span className="text-muted-foreground">Invoices imported</span>
        <span className="font-semibold tabular-nums">{summary.invoices.imported}</span>
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
      {(summary.invoices.invalidSkipped ?? 0) > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Skipped (invalid)</span>
          <span className="tabular-nums">{summary.invoices.invalidSkipped}</span>
        </div>
      )}
      {summary.invoices.failed > 0 && (
        <div className="flex justify-between">
          <span className="text-destructive">Failed to save</span>
          <span className="tabular-nums text-destructive">{summary.invoices.failed}</span>
        </div>
      )}

      <CollectionSummaryRows label="Brands" result={summary.brands} />
      <CollectionSummaryRows label="Clients" result={summary.clients} />
      <CollectionSummaryRows label="Templates" result={summary.templates} />
    </div>
  );
}

/**
 * One collection's rows in the import summary. Renders nothing for a legacy
 * invoices-only import (`result === null`) and nothing for a collection that
 * genuinely had zero records *and* nothing rejected either — every other
 * outcome (imported, skipped for any reason, or an unreadable section) gets
 * an explicit, honest line.
 */
function CollectionSummaryRows({
  label,
  result,
}: {
  label: string;
  result: CollectionSummaryData | null;
}) {
  if (!result) return null;

  const invalidSkipped = result.invalidSkipped ?? 0;
  const invalidShape = result.invalidShape ?? false;

  const hasAnythingToShow =
    result.imported > 0 ||
    result.skippedExisting > 0 ||
    invalidSkipped > 0 ||
    invalidShape ||
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
          <span className="text-muted-foreground">{label} skipped (already exist)</span>
          <span className="tabular-nums">{result.skippedExisting}</span>
        </div>
      )}
      {invalidSkipped > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{label} skipped (invalid)</span>
          <span className="tabular-nums">{invalidSkipped}</span>
        </div>
      )}
      {invalidShape && (
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
