import type { Brand, Invoice } from "./types";
import { BRAND_PALETTE, paletteColorForIndex } from "./palette";

/**
 * Derives an invoice prefix from a brand name when the prefix field is left
 * blank: the first letter of each word, first three words, uppercased.
 * A name with no letters to draw from (blank, or whitespace-only) falls back
 * to "INV" — an empty prefix would make every invoice number start with a
 * bare "-2026-001", which `parseInvoiceNumber`'s regex still parses but no
 * human would recognise as belonging to this brand.
 */
export function derivePrefix(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 3)
    .join("")
    .toUpperCase();
  return initials || "INV";
}

export interface DeleteGuard {
  /** False when the brand has invoices — deleting it must be refused. */
  allowed: boolean;
  count: number;
}

/**
 * Whether a brand is safe to delete, and how many invoices reference it.
 * Deleting a brand never cascades to its invoices, so a brand with any
 * invoices left pointing at it would orphan them — the caller refuses the
 * delete and sends the user to move or delete those invoices first.
 */
export function brandDeleteGuard(brand: Brand, invoices: Invoice[]): DeleteGuard {
  const count = invoices.filter((invoice) => invoice.brandId === brand.id).length;
  return { allowed: count === 0, count };
}

/** The singular/plural note shown above the "Delete brand" button. */
export function invoiceUsageLabel(count: number): string {
  if (count === 0) return "No invoices use this brand yet";
  return `${count} ${count === 1 ? "invoice uses" : "invoices use"} this brand`;
}

/**
 * The first `BRAND_PALETTE` colour not already assigned to an existing
 * brand, so two brands created back to back never default to the same
 * accent. Once every colour in the (small, 5-entry) palette is taken, falls
 * back to the deterministic positional assignment `paletteColorForIndex`
 * already uses elsewhere (`migrate.ts`), rather than refusing to return a
 * colour at all.
 */
export function nextUnusedAccentColor(brands: Brand[]): string {
  const used = new Set(brands.map((brand) => brand.accentColor));
  const unused = BRAND_PALETTE.find((color) => !used.has(color));
  return unused ?? paletteColorForIndex(brands.length);
}

/**
 * A logo is stored as a base64 data URL directly inside the brand record —
 * there is no server to upload it to. Base64 inflates a file's raw byte size
 * by roughly a third, and every brand/client/invoice this app has ever
 * created shares one ~5MB `localStorage` quota, so an uncapped upload could
 * quietly brick the whole workspace. 300KB raw (~400KB once encoded) is
 * generous for a logo mark while leaving that quota mostly for actual
 * invoice data.
 */
export const MAX_LOGO_BYTES = 300 * 1024;

/**
 * Rejects a logo upload before it ever reaches `FileReader`, returning a
 * user-facing reason or `null` when the file is acceptable. The `accept`
 * attribute on the file input only filters the OS picker's UI — it does not
 * stop a drag-and-drop or a non-conforming file chosen anyway, so this is
 * the actual gate.
 */
export function validateLogoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Logo must be an image file";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return `Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`;
  }
  return null;
}
