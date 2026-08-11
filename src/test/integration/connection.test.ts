import { describe, expect, it } from "vitest";
import { admin } from "./helpers";

describe("local Supabase stack", () => {
  it("is reachable with the service role key", async () => {
    const { data, error } = await admin.auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
