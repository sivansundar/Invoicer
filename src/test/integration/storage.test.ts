import { describe, it, expect, beforeAll } from "vitest";
import { makeUser } from "./helpers";
import { StorageApiError, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "brand-logos";
const PNG = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

async function makeBrand(client: SupabaseClient) {
  const { data, error } = await client
    .from("brands")
    .insert({ name: "Acme", invoice_prefix: "ACM", accent_color: "#000000" })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe("brand-logos bucket", () => {
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let brandA: string;

  beforeAll(async () => {
    userA = (await makeUser()).client;
    userB = (await makeUser()).client;
    brandA = await makeBrand(userA);
  });

  // Not `getBucket()`: nothing in the app calls it, and asserting through it
  // would need a `storage.buckets` SELECT policy that has no other caller.
  // The property that matters is the one the app actually relies on — that
  // an object is not servable without a signature. `getPublicUrl` builds the
  // URL the client would use against the same API host the other tests talk
  // to; it does not itself check anything.
  it("does not serve an object without a signature, even though the same object is servable at a signed URL", async () => {
    const path = `${brandA}/public-check.png`;
    const { error: uploadError } = await userA.storage.from(BUCKET).upload(path, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(uploadError).toBeNull();

    const { data: pub } = userA.storage.from(BUCKET).getPublicUrl(path);
    const res = await fetch(pub.publicUrl);
    expect(res.ok).toBe(false);
  });

  it("lets an owner upload under their own brand id", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`${brandA}/aaa.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeNull();
  });

  it("lets an owner replace the same object (upsert needs UPDATE, not just INSERT)", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`${brandA}/aaa.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).toBeNull();
  });

  it("lets an owner sign a URL for their own object", async () => {
    const { data, error } = await userA.storage.from(BUCKET).createSignedUrl(`${brandA}/aaa.png`, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain(`${brandA}/aaa.png`);
  });

  // LOGO_URL_TTL_SECONDS (src/lib/storage.ts) is 3600, so waiting it out
  // isn't an option — sign with an explicit short TTL instead. use-logo-src
  // refetches 10 minutes before that 3600s lapses (LOGO_URL_STALE_MS); that
  // margin is reasoned about, not proven. This proves the half that can be:
  // expiry is real, and a lapsed URL fails rather than quietly continuing to
  // serve the object.
  it("a signed logo URL stops resolving once its TTL has passed", async () => {
    const path = `${brandA}/expiry-check.png`;
    const { error: uploadError } = await userA.storage.from(BUCKET).upload(path, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(uploadError).toBeNull();

    const { data, error } = await userA.storage.from(BUCKET).createSignedUrl(path, 1);
    expect(error).toBeNull();

    const fresh = await fetch(data!.signedUrl);
    expect(fresh.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const stale = await fetch(data!.signedUrl);
    // Confirmed against the running Storage API rather than assumed: an
    // expired signed URL comes back 400 with an InvalidJWT body ("exp"
    // claim timestamp check failed) — the signature itself is a JWT, and
    // this is Storage rejecting it as expired, not a generic auth failure.
    // Not "expired" in the body text, despite that being the natural
    // guess — pin what the API actually says so a future upgrade that
    // changes the wording breaks this test for the right reason.
    expect(stale.status).toBe(400);
    const body = await stale.json();
    expect(body.error).toBe("InvalidJWT");
    expect(body.message).toMatch(/exp.*claim.*timestamp/i);
  });

  // The falsification tests. These are the point of the task.
  it("denies a second user uploading under someone else's brand id", async () => {
    const { error } = await userB.storage.from(BUCKET).upload(`${brandA}/evil.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).not.toBeNull();
  });

  it("denies a second user signing a URL for someone else's object", async () => {
    const { data, error } = await userB.storage.from(BUCKET).createSignedUrl(`${brandA}/aaa.png`, 60);
    expect(data?.signedUrl).toBeUndefined();
    expect(error).not.toBeNull();
  });

  it("denies a second user listing someone else's brand folder", async () => {
    const { data } = await userB.storage.from(BUCKET).list(brandA);
    expect(data ?? []).toEqual([]);
  });

  // A non-uuid first segment must be DENIED — an authorization decision —
  // not raise 22P02 — a database error. Both surface as `error !== null` and
  // neither response body literally contains the string "22P02" (the
  // storage API translates the SQLSTATE into its own message text), so
  // `JSON.stringify(error)).not.toContain("22P02")` is vacuous: it passes
  // whether the policy denies correctly or throws. The two cases are
  // distinguishable through `StorageApiError#code`: an RLS denial reports
  // `AccessDenied` (403), a raised 22P02 reports `InvalidParameter` (400).
  // See the fix report for both captured error objects.
  it("denies a path whose first segment is not a brand id, without erroring", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`not-a-uuid/x.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).not.toBeNull();
    expect(error).toBeInstanceOf(StorageApiError);
    expect((error as StorageApiError).code).toBe("AccessDenied");
  });
});
