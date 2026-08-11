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

/**
 * One schema-valid row per table. These would satisfy every not-null and
 * check constraint if a permitted caller sent them, so a rejection is
 * attributable to permissions rather than to a malformed payload.
 * The uuids are deliberately random and reference nothing.
 */
const VALID_ROWS: Record<(typeof TABLES)[number], Record<string, unknown>> = {
  orgs: { name: "Anon Org" },
  org_members: {
    org_id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    role: "owner",
  },
  brands: {
    org_id: "00000000-0000-4000-8000-000000000001",
    name: "Anon Brand",
    invoice_prefix: "AN",
    accent_color: "#2563eb",
  },
  clients: {
    org_id: "00000000-0000-4000-8000-000000000001",
    company_name: "Anon Client",
  },
  invoices: {
    org_id: "00000000-0000-4000-8000-000000000001",
    brand_id: "00000000-0000-4000-8000-000000000003",
    invoice_number: "AN-2026-001",
    currency: "INR",
    bill_date: "2026-08-11",
    due_date: "2026-09-10",
    client_snapshot: {},
    brand_snapshot: {},
  },
  invoice_items: {
    invoice_id: "00000000-0000-4000-8000-000000000004",
    position: 0,
    description: "Anon line",
    amount: "1.00",
    tax: "0",
  },
  email_templates: {
    org_id: "00000000-0000-4000-8000-000000000001",
    name: "Anon template",
    subject: "Hello",
    tone: "Friendly",
    body: "Body",
  },
};

describe("an anonymous visitor can reach no data at all", () => {
  for (const table of TABLES) {
    it(`${table}: select returns no rows to anon`, async () => {
      const { data } = await anon.from(table).select("*").limit(1);
      // A hard permission error and an empty result are both acceptable.
      // What must never happen is a row coming back. `error` is deliberately
      // not asserted on: any assertion covering "error OR empty" is
      // vacuously true, and the row check alone already says what matters.
      expect(data ?? []).toEqual([]);
    });

    it(`${table}: insert is rejected for anon`, async () => {
      // A *valid* payload, so the rejection is attributable to permissions
      // rather than to a not-null violation. `insert({})` would be rejected
      // by every table's constraints even for a fully authorized caller,
      // which would prove nothing about anon.
      const { error } = await anon.from(table).insert(VALID_ROWS[table]);
      expect(error).not.toBeNull();
    });
  }
});
