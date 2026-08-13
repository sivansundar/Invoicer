import { describe, it, expect, beforeAll } from "vitest";
import { makeUser } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

// The brief's spec assumes `signInAsNewUser` returning a bare client; the
// real helper is `makeUser`, which returns { client, userId, orgId, email }.
// We only need `.client` here.

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

  it("the bucket exists and is private", async () => {
    const { data, error } = await userA.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
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

  // A non-uuid first segment must be DENIED, not raise 22P02. A policy that
  // throws turns a permission check into a 500.
  it("denies a path whose first segment is not a brand id, without erroring", async () => {
    const { error } = await userA.storage.from(BUCKET).upload(`not-a-uuid/x.png`, PNG, {
      contentType: "image/png",
      upsert: true,
    });
    expect(error).not.toBeNull();
    expect(JSON.stringify(error)).not.toContain("22P02");
  });
});
