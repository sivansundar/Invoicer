import type { Brand, Client, EmailTemplate, Invoice } from "@/lib/types";
import {
  getBrands,
  saveBrand,
  getClients,
  saveClient,
  getTemplates,
  saveTemplate,
  getInvoices,
  createInvoice,
  saveInvoice,
} from "@/lib/storage";
import { validateImportedInvoices, validateImportedBackup } from "@/lib/import-validation";
import { remapNonUuidIds } from "@/lib/import-remap";
import { migrateToV2 } from "@/lib/migrate";

/**
 * The validate → normalise → default-currency → remap → write pipeline
 * behind the "Import" button in `import-export.tsx`, lifted out so a second
 * caller (the one-time prompt offering to import data left behind by the
 * local-only build) can drive it without a copy of this logic to drift out
 * of sync with the file importer's.
 *
 * `import-export.tsx` keeps the dialog and every piece of interactive
 * conflict-resolution state — this file has none of that. Its only opinion
 * about a conflicting invoice is the default `writeImport` applies when a
 * caller doesn't supply `onConflict`: treat the collision as an update, the
 * same as a file-importer user who has already chosen "Overwrite".
 */

export interface ImportCollections {
  brands: Brand[];
  clients: Client[];
  templates: EmailTemplate[];
  invoices: Invoice[];
}

/**
 * One conflicting pair — an incoming invoice and the existing one it
 * collides with, matched by invoice number. Also the shape the file
 * importer's dialog renders one round of "Existing vs Incoming" from.
 */
export interface PendingConflict {
  incoming: Invoice;
  existing: Invoice;
}

export type ConflictResolution =
  | { action: "overwrite" }
  | { action: "rename"; newNumber: string }
  | { action: "discard" };

/**
 * Decides how a single invoice-number collision is handled. Synchronous
 * because every caller today already knows every resolution before
 * `writeImport` is called: the file importer's dialog collects one answer
 * per conflict across several round-trips and only calls `writeImport` once
 * the last one is in, at which point it's a lookup, not a question.
 */
export type ConflictResolver = (conflict: PendingConflict) => ConflictResolution;

/** Per-collection write accounting — never overwrites, only adds or skips. See `writeCollection` below. */
export interface CollectionWriteResult {
  imported: number;
  /** Already present locally by `id` (or a duplicate `id` within the file itself) — never overwritten. */
  skippedExisting: number;
  failed: number;
}

/** Per-invoice write accounting — the one collection with a conflict story richer than "skip". */
export interface InvoiceWriteResult {
  /** Invoices actually persisted this run — new writes, overwrites, and renames combined. */
  imported: number;
  overwritten: number;
  renamed: number;
  /** The resolver (or a caller with no invoices to reconcile) chose "discard" for this one. */
  discarded: number;
  failed: number;
}

/** Per-record accounting for one call to `writeImport`. */
export interface ImportSummary {
  brands: CollectionWriteResult;
  clients: CollectionWriteResult;
  templates: CollectionWriteResult;
  invoices: InvoiceWriteResult;
  remappedIds: number;
}

export type PrepareImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      collections: ImportCollections;
      /**
       * Ids rewritten because Postgres would not accept them — see
       * `import-remap.ts`. Surfaced rather than silent, because it has a
       * consequence the caller can otherwise only discover by hitting it:
       * re-importing the same legacy file produces a second copy of those
       * records instead of skipping them, since their new ids no longer
       * match what landed the first time.
       */
      remappedIds: number;
      /**
       * Records dropped during validation, before anything below was ever
       * normalised or remapped — the file importer's dialog reports these
       * per collection alongside what `writeImport` actually did.
       */
      skipped: { brands: number; clients: number; templates: number; invoices: number };
      /** Whether a collection's value in the file wasn't a list at all — see `CollectionValidation.invalidShape`. */
      invalidShape: { brands: boolean; clients: boolean; templates: boolean };
    };

/** The legacy shape: a bare `Invoice[]` array, exactly what every existing `invoices-<date>.json` file on disk already is. */
function prepareLegacyInvoiceArray(parsed: unknown[]): PrepareImportResult {
  const result = validateImportedInvoices(parsed);
  if (!result.ok) {
    return {
      ok: false,
      error: "Failed to import — expected a JSON array of invoices. Nothing was imported.",
    };
  }

  const { valid: incoming, skipped: invalidSkipped } = result;
  if (incoming.length === 0) {
    return {
      ok: false,
      error:
        invalidSkipped > 0
          ? `Nothing to import — all ${invalidSkipped} record${invalidSkipped === 1 ? "" : "s"} in the file were invalid or missing required fields.`
          : "Nothing to import — the file was empty.",
    };
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

  return {
    ok: true,
    collections: legacyRemap.collections,
    remappedIds: legacyRemap.remapped,
    skipped: { brands: 0, clients: 0, templates: 0, invoices: invalidSkipped },
    invalidShape: { brands: false, clients: false, templates: false },
  };
}

/** The full-backup envelope shape: `{ version, exportedAt, brands, clients, templates, invoices }`. */
function prepareBackupEnvelope(parsed: unknown): PrepareImportResult {
  const result = validateImportedBackup(parsed);
  if (!result.ok) {
    return {
      ok: false,
      error: "Failed to import — expected an Invoicer backup file. Nothing was imported.",
    };
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
    return {
      ok: false,
      error: anythingRejected
        ? "Nothing to import — every record in the file was invalid, missing required fields, or in an unreadable section."
        : "Nothing to import — the file was empty.",
    };
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

  return {
    ok: true,
    collections: remap.collections,
    remappedIds: remap.remapped,
    skipped: {
      brands: brands.skipped,
      clients: clients.skipped,
      templates: templates.skipped,
      invoices: invoices.skipped,
    },
    invalidShape: {
      brands: brands.invalidShape,
      clients: clients.invalidShape,
      templates: templates.invalidShape,
    },
  };
}

/**
 * Synchronous: validate → migrateToV2 normalise → default `currency` →
 * remap non-uuid ids. No writes, so a caller can show the user what will
 * happen before anything is sent.
 *
 * A bare array is the legacy invoices-only shape every export on disk
 * already is; anything else is validated as a full-backup envelope. Both
 * branches share the same result shape so a caller never has to know which
 * one it got.
 */
export function prepareImport(parsed: unknown): PrepareImportResult {
  return Array.isArray(parsed) ? prepareLegacyInvoiceArray(parsed) : prepareBackupEnvelope(parsed);
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
async function writeCollection<T extends { id: string }>(
  items: T[],
  existingIds: Set<string>,
  save: (item: T) => Promise<unknown>
): Promise<CollectionWriteResult> {
  const seenThisBatch = new Set<string>();
  let imported = 0;
  let skippedExisting = 0;
  let failed = 0;

  // Sequential rather than Promise.all: a rejected write must be counted,
  // not abort the batch, and the failure count is what the summary reports.
  // Not all-or-nothing, and deliberately so, permanently — see
  // `docs/PHASE4-CARRYOVER.md`, "Import is not all-or-nothing": conflict
  // resolution already spans several dialog round-trips (the file importer)
  // or is resolved automatically (the local-data prompt), so no transaction
  // could span the whole operation anyway. Per-record accounting is
  // accurate instead of a transaction that's only atomic when it happens
  // not to collide.
  for (const item of items) {
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

  return { imported, skippedExisting, failed };
}

/**
 * Writes every incoming invoice, resolving a number collision through
 * `onConflict` — or, with none supplied, by treating it as an update. See
 * `matchByIdentity`/`matchByNumber` below for how a conflict is found —
 * deliberately two different strategies rather than one.
 */
async function writeInvoices(
  invoices: Invoice[],
  options: { onConflict?: ConflictResolver; knownConflicts?: PendingConflict[] } = {}
): Promise<InvoiceWriteResult> {
  const { onConflict, knownConflicts } = options;

  // Two different ways to find "the row this incoming invoice conflicts
  // with", deliberately not merged into one lookup:
  //
  // - `knownConflicts`, when supplied, is the caller's own earlier
  //   detection — each entry's `existing` is the exact row it showed the
  //   user before asking how to resolve it. Matched by identity, never by
  //   re-fetching: a fresh `getInvoices()` lookup could disagree with what
  //   the caller already decided (nothing else writes invoices in this app
  //   today, but "currently unreachable" isn't a property this function
  //   should rely on), and disagreeing in the direction of "no match
  //   found" would silently turn a user's `discard` into a create. An
  //   incoming invoice with no entry here was already determined
  //   non-conflicting by the caller and is written with no lookup at all.
  //
  // - With no `knownConflicts` (the local-data prompt, and any other caller
  //   with no detection pass of its own), this fetches `getInvoices()` once
  //   and matches by invoice number itself — the only case where
  //   self-detection is correct, because nothing upstream has done it yet.
  //   Skipped entirely when there is nothing to match: `writeImport` calls
  //   this with `invoices: []` for its brands/clients/templates-only pass,
  //   and a caller with no incoming invoices has nothing this lookup could
  //   ever match against — an unguarded call would still make the round
  //   trip, and a failure of it would reject the whole import after
  //   brands/clients/templates had already been written successfully.
  const matchByIdentity = knownConflicts
    ? new Map(knownConflicts.map((c) => [c.incoming, c.existing]))
    : null;
  const matchByNumber =
    knownConflicts || invoices.length === 0
      ? null
      : new Map((await getInvoices()).map((inv) => [inv.invoiceNumber, inv] as const));

  const findMatch = (incoming: Invoice): Invoice | null =>
    matchByIdentity
      ? (matchByIdentity.get(incoming) ?? null)
      : (matchByNumber!.get(incoming.invoiceNumber) ?? null);

  let saved = 0;
  let overwritten = 0;
  let renamed = 0;
  let discarded = 0;
  let failed = 0;

  for (const incoming of invoices) {
    const match = findMatch(incoming);

    if (!match) {
      // preserveNumber: a restored invoice is not a new document. It may
      // already be in a client's inbox under the number it was issued
      // with, so allocating a fresh one would put the app's records and
      // the customer's out of step.
      try {
        await createInvoice(incoming, { preserveNumber: true });
        saved++;
      } catch {
        failed++;
      }
      continue;
    }

    // No resolver supplied means no conflicts were expected — treat the
    // collision the way the file importer does once the user has already
    // chosen "Overwrite" for it.
    const resolution: ConflictResolution = onConflict
      ? onConflict({ incoming, existing: match })
      : { action: "overwrite" };

    if (resolution.action === "overwrite") {
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
        await saveInvoice({ ...incoming, id: match.id });
        overwritten++;
      } catch {
        failed++;
      }
    } else if (resolution.action === "rename") {
      try {
        await createInvoice(
          { ...incoming, invoiceNumber: resolution.newNumber },
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

  return { imported: saved + overwritten + renamed, overwritten, renamed, discarded, failed };
}

/**
 * Writes through the seam. NOT atomic — see `docs/PHASE4-CARRYOVER.md` for
 * why per-record accounting was chosen over a transaction that only spans
 * the no-conflict case.
 *
 * Brands, clients and templates are written before invoices are even
 * looked at, so an imported invoice's brandId/clientId resolve against
 * records that already exist by the time anything downstream reads them.
 * A caller free of invoice conflicts (Task 8's prompt, or the file
 * importer once it already knows every resolution) makes one call with all
 * four collections; the file importer's dialog instead makes two — one for
 * brands/clients/templates immediately, and a second, invoices-only call
 * once every round of its dialog has an answer — so it can show the
 * conflict UI in between without this function knowing that happened.
 *
 * `conflicts`, when the caller already detected them (the file importer's
 * dialog always does), must be the exact `PendingConflict[]` shown to the
 * user — see `writeInvoices` for why this can't be re-derived instead.
 */
export async function writeImport(
  collections: ImportCollections,
  options: { remappedIds: number; onConflict?: ConflictResolver; conflicts?: PendingConflict[] }
): Promise<ImportSummary> {
  // Each fetch feeds `writeCollection`'s `existingIds` set for exactly one
  // collection, and an empty incoming collection has nothing to check that
  // set against — `writeCollection`'s loop wouldn't run either way. Both
  // callers in `import-export.tsx` make a call with three of these four
  // collections empty (the invoices-only pass, and the
  // brands/clients/templates-only pass), so skipping the corresponding
  // fetch is a real, not theoretical, saving.
  const [existingBrands, existingClients, existingTemplates] = await Promise.all([
    collections.brands.length > 0 ? getBrands() : Promise.resolve([]),
    collections.clients.length > 0 ? getClients() : Promise.resolve([]),
    collections.templates.length > 0 ? getTemplates() : Promise.resolve([]),
  ]);

  // Sequential across collections, matching the sequential write loop
  // inside each one — see `writeCollection`.
  const brands = await writeCollection(
    collections.brands,
    new Set(existingBrands.map((b) => b.id)),
    saveBrand
  );
  const clients = await writeCollection(
    collections.clients,
    new Set(existingClients.map((c) => c.id)),
    saveClient
  );
  const templates = await writeCollection(
    collections.templates,
    new Set(existingTemplates.map((t) => t.id)),
    saveTemplate
  );

  const invoices = await writeInvoices(collections.invoices, {
    onConflict: options.onConflict,
    knownConflicts: options.conflicts,
  });

  return { brands, clients, templates, invoices, remappedIds: options.remappedIds };
}
