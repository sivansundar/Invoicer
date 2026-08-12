import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

/**
 * `org_id` is filled by a column default derived from the caller's
 * membership, so application code never passes it. This file pins both
 * halves of that: the default puts the row in the right org, and it is not
 * a way around the RLS `with check` — a default fills a blank, it does not
 * authorize.
 */

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([makeUser(), makeUser()]);
});

// Typed as a widened record rather than left to inference: the three row
// shapes differ, and supabase-js resolves an inferred union against the
// first table's columns, so `clients` fails to typecheck against `brands`.
const DEFAULT_CASES: Array<[string, Record<string, unknown>]> = [
  ["brands", { name: "Acme", invoice_prefix: "AC", accent_color: "#2563eb" }],
  ["clients", { company_name: "Client Co" }],
  ["email_templates", { name: "T", subject: "S", tone: "Friendly", body: "B" }],
];

describe("org_id column default", () => {
  it.each(DEFAULT_CASES)("fills %s.org_id from the caller's membership", async (table, row) => {
    const { data, error } = await alice.client.from(table).insert(row).select("org_id").single();

    expect(error).toBeNull();
    expect(data!.org_id).toBe(alice.orgId);
  });

  it("fills invoices.org_id, which the composite FK then checks the brand against", async () => {
    const { data: brand } = await alice.client
      .from("brands")
      .insert({ name: "Numbered", invoice_prefix: "NU", accent_color: "#000000" })
      .select("id")
      .single();

    const { data, error } = await alice.client
      .from("invoices")
      .insert({
        brand_id: brand!.id,
        invoice_number: `NU-2026-${Math.floor(Math.random() * 100000)}`,
        currency: "INR",
        bill_date: "2026-06-01",
        due_date: "2026-06-15",
        client_snapshot: { companyName: "C", address: "A" },
        brand_snapshot: { name: "Numbered", invoicePrefix: "NU" },
      })
      .select("org_id")
      .single();

    expect(error).toBeNull();
    expect(data!.org_id).toBe(alice.orgId);
  });
});

describe("the default does not authorize", () => {
  it("still rejects an explicit org_id belonging to another org", async () => {
    const { error } = await alice.client
      .from("brands")
      .insert({
        org_id: bob.orgId,
        name: "Squatter",
        invoice_prefix: "SQ",
        accent_color: "#ff0000",
      })
      .select("id")
      .single();

    // RLS `with check` refuses the row outright — 42501 is the policy
    // violation. If this ever starts passing, the default has been mistaken
    // for an authorization boundary.
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("leaves no row behind after the rejected insert", async () => {
    const { data } = await admin.from("brands").select("id").eq("name", "Squatter");

    expect(data).toEqual([]);
  });
});

describe("the solo-UX assumption is enforced, not assumed", () => {
  it("refuses to guess when a user belongs to more than one org", async () => {
    // A dedicated user, because this gives them a second membership and
    // would otherwise change what the default returns for every later test
    // in this file.
    const multi = await makeUser();
    const other = await makeUser();

    const { error: joinError } = await admin
      .from("org_members")
      .insert({ org_id: other.orgId, user_id: multi.userId, role: "member" });
    expect(joinError).toBeNull();

    const { error } = await multi.client
      .from("brands")
      .insert({ name: "Ambiguous", invoice_prefix: "AM", accent_color: "#222222" })
      .select("id")
      .single();

    // Raised by private.current_org_id() rather than silently landing in
    // whichever org happened to sort first. When multi-org shipping is real,
    // this is the error that tells every insert site to name its org.
    expect(error).not.toBeNull();
    expect(error!.code).toBe("22023");
    expect(error!.message).toContain("belongs to 2 orgs");
  });
});

describe("brands.logo_data", () => {
  it("round-trips a base64 data URL", async () => {
    // The bridge column standing in for Storage until logos move there.
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

    const { data, error } = await alice.client
      .from("brands")
      .insert({
        name: "Logo Co",
        invoice_prefix: "LO",
        accent_color: "#111111",
        logo_data: logo,
      })
      .select("logo_data")
      .single();

    expect(error).toBeNull();
    expect(data!.logo_data).toBe(logo);
  });
});
