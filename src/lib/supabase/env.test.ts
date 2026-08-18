import { describe, expect, it, afterEach } from "vitest";
import { supabaseEnv } from "./env";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("supabaseEnv", () => {
  it("returns both values when they are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    expect(supabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_x",
    });
  });

  it("names the missing variable and the file it belongs in", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(() => supabaseEnv()).toThrow(/\.env\.local/);
  });

  it("rejects an empty string, not just an absent variable", () => {
    // A shell that exports an unset variable produces "" — indistinguishable
    // from "configured" to a `!` assertion, and fatal one layer down.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
