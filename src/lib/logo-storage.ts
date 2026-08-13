/**
 * Content addressing for brand logos. Kept free of any Supabase import so
 * the hashing and path rules are testable on their own — the seam
 * (`@/lib/storage`) is what actually talks to the bucket.
 */

/** Decodes the base64 payload of a data URL. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * The object name is the digest of the image bytes, which is what makes
 * replacing a logo write a new object instead of overwriting one — an
 * invoice issued under the old logo keeps resolving it.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * `{brand_id}/{sha256}.png`. The brand id must be the FIRST segment: the
 * storage policy checks `(storage.foldername(name))[1]` against
 * `public.brands`, so a path shaped any other way is denied.
 *
 * Always `.png` — `downsampleImage` (`@/lib/brands`) re-encodes every upload
 * through a canvas, so nothing else ever reaches the bucket.
 */
export function logoObjectPath(brandId: string, sha: string): string {
  return `${brandId}/${sha}.png`;
}
