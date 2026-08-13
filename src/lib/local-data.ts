/**
 * Reads what the local-only build left on this device.
 *
 * READ ONLY. Phase 2 removed the migration-on-mount because it rewrote a
 * user's local data before they had chosen to bring it into their account —
 * for anyone still on the old build that is their only copy. Nothing here
 * writes an `invoicer_*` data key, and the dismissal flag below is a
 * separate key of its own.
 */

const KEYS = {
  brands: "invoicer_brands",
  clients: "invoicer_clients",
  templates: "invoicer_templates",
  invoices: "invoicer_invoices",
} as const;

type CollectionKey = keyof typeof KEYS;

const DISMISSED_KEY = "invoicer_import_prompt";

interface ReadResult {
  value: unknown[];
  /**
   * The key held a real, non-empty string that could not be read as a
   * record array — either it was not valid JSON at all (a truncated write,
   * e.g. from the old build's localStorage-quota path), or it parsed to
   * something other than an array. Distinct from the key being absent, or
   * legitimately holding `"[]"`: both of those are "nothing was ever here,"
   * this is "something was here and is now unreadable." A caller that
   * conflates the two can offer to delete the one surviving copy of
   * whatever that was.
   */
  corrupt: boolean;
}

/**
 * Never throws. This runs on mount for every signed-in user, and a corrupt
 * key on one collection must not take the app down — the importer's
 * validation is what reports bad data, in a dialog, where it can be read.
 * Reporting corruption via `corrupt` is not the same as throwing on it.
 */
function readArray(key: string): ReadResult {
  if (typeof window === "undefined") return { value: [], corrupt: false };
  const raw = localStorage.getItem(key);
  if (raw === null) return { value: [], corrupt: false };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { value: parsed, corrupt: false };
    return { value: [], corrupt: true };
  } catch {
    return { value: [], corrupt: true };
  }
}

export interface LocalCollections {
  brands: unknown[];
  clients: unknown[];
  templates: unknown[];
  invoices: unknown[];
  /**
   * Keys that were present but unparseable or not an array-shaped payload
   * — see `ReadResult.corrupt`. Empty in the common case. A caller must
   * treat a non-empty list here the same as a record that failed to
   * import: whatever it held exists nowhere else, so nothing gates on
   * "everything imported" while this is non-empty.
   */
  corruptKeys: CollectionKey[];
}

export function readLocalCollections(): LocalCollections | null {
  const read: Record<CollectionKey, ReadResult> = {
    brands: readArray(KEYS.brands),
    clients: readArray(KEYS.clients),
    templates: readArray(KEYS.templates),
    invoices: readArray(KEYS.invoices),
  };

  const corruptKeys = (Object.keys(KEYS) as CollectionKey[]).filter((key) => read[key].corrupt);

  const total = Object.values(read).reduce((sum, { value }) => sum + value.length, 0);
  // A device with nothing readable AND nothing corrupt truly has nothing to
  // offer — the null the prompt uses to render nothing at all. A corrupt
  // key with zero recoverable records still has to be reported, not treated
  // as equivalent to "nothing was ever here."
  if (total === 0 && corruptKeys.length === 0) return null;

  return {
    brands: read.brands.value,
    clients: read.clients.value,
    templates: read.templates.value,
    invoices: read.invoices.value,
    corruptKeys,
  };
}

/** Drives the prompt's copy — "We found 14 invoices on this device." */
export function localInvoiceCount(): number {
  return readArray(KEYS.invoices).value.length;
}

/**
 * Dismissal is local, not a database flag. The prompt is about THIS device's
 * data: a second browser holding different local data is exactly the case
 * where asking again is right, and a server-side flag would silently
 * suppress it there.
 */
export function isImportPromptDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISSED_KEY) === "dismissed";
}

export function dismissImportPrompt(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, "dismissed");
}

/**
 * Removes the local-only build's data. Called from exactly one place: the
 * button the user presses AFTER seeing what was imported. Never automatic,
 * never on success — see the doc comment at the top of this file.
 */
export function clearLocalCollections(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}
