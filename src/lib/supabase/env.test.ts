import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * These tests run in Node, where `process.env` is real — so they cannot
 * observe the one failure mode that actually bit: in the browser there is no
 * `process.env`, and Next.js only substitutes LITERAL `process.env.NEXT_PUBLIC_…`
 * occurrences at build time. A computed read such as `process.env[name]` is
 * left alone and evaluates to undefined, so `createClient()` throws "is not
 * set" against a perfectly good .env.local.
 *
 * Asserting on the source is the only layer here that can catch a regression,
 * since every runtime test of this module passes either way.
 */
describe("browser-safe env reads", () => {
  // Resolved from cwd: under the jsdom environment `import.meta.url` is not
  // a file: URL, so readFileSync cannot take it.
  const source = readFileSync(resolve(process.cwd(), "src/lib/supabase/env.ts"), "utf8");

  // Comments stripped first: the doc above env.ts names the broken form
  // `process.env[name]` in prose, and the guard is about code.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("reads process.env only by literal name", () => {
    expect(code).not.toMatch(/process\.env\s*\[/);
  });

  it("names each variable longhand so the bundler can inline it", () => {
    expect(code).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(code).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});
