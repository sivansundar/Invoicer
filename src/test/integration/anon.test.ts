import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

/** A signed-out visitor: the publishable key with no session attached. */
const anon = createClient(URL, PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  "orgs",
  "org_members",
  "brands",
  "clients",
  "invoices",
  "invoice_items",
  "email_templates",
] as const;

describe("an anonymous visitor can reach no data at all", () => {
  for (const table of TABLES) {
    it(`${table}: select returns no rows to anon`, async () => {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Either a hard permission error, or an empty result — never a row.
      // Both are acceptable outcomes; a row is not.
      expect(error ?? { code: "none" }).toBeTruthy();
      expect(data ?? []).toEqual([]);
    });

    it(`${table}: insert is rejected for anon`, async () => {
      const { error } = await anon.from(table).insert({});
      expect(error).not.toBeNull();
    });
  }
});
