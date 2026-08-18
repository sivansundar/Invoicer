import type { Brand } from "./types";

/**
 * The brand row committed; its logo did not.
 *
 * `saveBrand` writes the row before it uploads, because the bucket's INSERT
 * policy needs the row to exist and a brand's id is minted client-side. A
 * failure in the upload half therefore cannot roll the first half back, and
 * a caller that reads a plain rejection as "nothing changed" is wrong about
 * every field except the logo.
 *
 * `brand` is what is actually in the database now — including the base64
 * still sitting in `logo_data`, which is what the brand renders from until
 * the next successful save re-attempts the upload.
 *
 * Lives in its own module, not `./storage`, because `src/test/fake-seam.ts`
 * stands in for `@/lib/storage` under `vi.mock("@/lib/storage", () =>
 * import("@/test/fake-seam"))`. If the fake re-exported this class from
 * `@/lib/storage` instead of importing it from here, that mock would
 * intercept the fake's own import of `@/lib/storage` and deadlock loading
 * itself (confirmed: it hangs `vitest run`). Because this module is never
 * mocked, both `./storage` and `@/test/fake-seam` import and re-export the
 * SAME class object in every context, so `err instanceof LogoUploadError`
 * stays reliable everywhere — including against partial mocks of
 * `@/lib/storage` (e.g. `vi.importActual` plus one overridden export) that
 * a local, duplicated class in the fake would silently defeat.
 */
export class LogoUploadError extends Error {
  constructor(
    readonly brand: Brand,
    override readonly cause: unknown
  ) {
    super("Saved, but the logo could not be uploaded");
    this.name = "LogoUploadError";
  }
}
