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
 * Sanity cap on the *raw upload*, before it is ever decoded — purely to stop
 * the browser from being handed something absurd (a multi-hundred-MB RAW
 * photo) to decode and draw to a canvas, which can hang or crash a tab well
 * before `MAX_LOGO_STORED_BYTES` below is ever reached. This is not the
 * budget the storage math cares about; `downsampleImage` is.
 */
export const MAX_LOGO_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * A logo is stored as a base64 data URL directly inside the brand record —
 * there is no server to upload it to — and, critically, `snapshotFromBrand`
 * (`migrate.ts`) copies that same data URL verbatim into *every invoice's*
 * frozen `brandSnapshot` at creation time, deliberately, so an issued
 * invoice's PDF still looks as it did when sent even after the brand's logo
 * later changes. That means storage scales with **invoice count**, not
 * brand count: one 300KB logo (this constant's previous value, sized as if
 * one brand meant one copy) on a brand with 30 invoices was actually ~9MB of
 * duplicated base64 — on its own enough to exhaust a typical 5–10MB
 * `localStorage` quota shared with every brand/client/invoice this app has
 * ever created.
 *
 * `downsampleImage` is the real fix — it makes the *stored* artefact small
 * regardless of what was uploaded, so the per-invoice duplication above is
 * affordable. This is the backstop for the rare case a downsampled image is
 * still large (a highly-detailed 256×256 PNG that just doesn't compress
 * well): 80KB × 30 invoices is ~2.4MB, a comfortable fraction of the shared
 * quota rather than most of it.
 */
export const MAX_LOGO_STORED_BYTES = 80 * 1024;

/** The longer edge a logo is downsampled to. Generous for a mark rendered at
 *  32px on screen and 32pt in the PDF — see `invoice-preview.tsx` / `invoice-pdf.tsx`. */
export const LOGO_MAX_DIMENSION = 256;

/**
 * Rejects a logo upload before it ever reaches the image decoder, returning
 * a user-facing reason or `null` when the file is acceptable. The `accept`
 * attribute on the file input only filters the OS picker's UI — it does not
 * stop a drag-and-drop or a non-conforming file chosen anyway, so this is
 * the actual gate.
 *
 * `image/svg+xml` is accepted here like any other `image/*` type. An SVG
 * referenced purely via `<img src="data:image/svg+xml;...">` cannot execute
 * embedded `<script>` — browsers only grant that to an SVG loaded as a
 * document (an `<object>`/`<iframe>`, or inline `<svg>` markup) — so this is
 * safe as wired today. That assumption breaks if a logo is ever rendered
 * inline instead of via `<img>`/`<Image>`.
 */
export function validateLogoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Logo must be an image file";
  }
  if (file.size > MAX_LOGO_SOURCE_BYTES) {
    return `Logo must be under ${Math.round(MAX_LOGO_SOURCE_BYTES / (1024 * 1024))}MB`;
  }
  return null;
}

/**
 * The `{ width, height }` an image is drawn at once downsampled to fit
 * within `maxDimension` on its longer edge, preserving aspect ratio. Pure
 * and deliberately separated from `downsampleImage`'s canvas work below so
 * the aspect-ratio math is testable without a real image decoder.
 *
 * Never upscales — an image already smaller than `maxDimension` on both
 * edges is returned unchanged, since stretching a small logo up would only
 * make it blurrier for no storage benefit.
 */
export function computeDownsampleDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The decoded byte size of a base64 data URL, without actually decoding
 * it — 4 base64 characters encode 3 bytes, minus 1 byte per trailing `=`
 * padding character. Used to enforce `MAX_LOGO_STORED_BYTES` against the
 * canvas's own `toDataURL()` output.
 */
export function dataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Logo file could not be read"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo file could not be read"));
    img.src = src;
  });
}

/**
 * Reads an already-`validateLogoFile`-approved image, draws it to a canvas
 * bounded to `maxDimension` on its longer edge, and returns the result as a
 * PNG data URL — small regardless of what was uploaded, so the per-invoice
 * duplication `snapshotFromBrand` performs (see `MAX_LOGO_STORED_BYTES`
 * above) stays affordable. PNG (not JPEG) specifically to preserve
 * transparency, which is common for a logo mark meant to sit on both light
 * and dark surfaces.
 *
 * Rejects (rather than silently truncating or storing an oversized value)
 * when the result is still over `MAX_LOGO_STORED_BYTES` after downsampling —
 * a pathological, highly-detailed image that doesn't compress well even at
 * `maxDimension` — and when this browser has no working 2D canvas context.
 */
export async function downsampleImage(
  file: File,
  maxDimension: number = LOGO_MAX_DIMENSION
): Promise<string> {
  const sourceUrl = await readFileAsDataUrl(file);
  const img = await loadImage(sourceUrl);

  const { width, height } = computeDownsampleDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxDimension
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Logo could not be processed in this browser");
  }
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrlByteSize(dataUrl) > MAX_LOGO_STORED_BYTES) {
    throw new Error("Logo is still too large after resizing — try a simpler image");
  }
  return dataUrl;
}
