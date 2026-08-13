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

const DISMISSED_KEY = "invoicer_import_prompt";

/**
 * Never throws. This runs on mount for every signed-in user, and a corrupt
 * key on one collection must not take the app down — the importer's
 * validation is what reports bad data, in a dialog, where it can be read.
 */
function readArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLocalCollections(): {
  brands: unknown[];
  clients: unknown[];
  templates: unknown[];
  invoices: unknown[];
} | null {
  const collections = {
    brands: readArray(KEYS.brands),
    clients: readArray(KEYS.clients),
    templates: readArray(KEYS.templates),
    invoices: readArray(KEYS.invoices),
  };

  const total = Object.values(collections).reduce((sum, list) => sum + list.length, 0);
  return total === 0 ? null : collections;
}

/** Drives the prompt's copy — "We found 14 invoices on this device." */
export function localInvoiceCount(): number {
  return readArray(KEYS.invoices).length;
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
