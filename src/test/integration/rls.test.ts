import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let aliceBrandId: string;
let aliceInvoiceId: string;

beforeAll(async () => {
  alice = await makeUser();
  bob = await makeUser();

  const { data: brand, error: brandError } = await alice.client
    .from("brands")
    .insert({
      org_id: alice.orgId,
      name: "Alice Studio",
      invoice_prefix: "AL",
      accent_color: "#2563eb",
    })
    .select()
    .single();
  if (brandError) throw brandError;
  aliceBrandId = brand.id;

  const { data: invoice, error: invoiceError } = await alice.client
    .from("invoices")
    .insert({
      org_id: alice.orgId,
      brand_id: aliceBrandId,
      invoice_number: "AL-2026-001",
      number_year: 2026,
      number_seq: 1,
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: { companyName: "Alice Client" },
      brand_snapshot: { name: "Alice Studio" },
      total: "5000.00",
    })
    .select()
    .single();
  if (invoiceError) throw invoiceError;
  aliceInvoiceId = invoice.id;
});

describe("a user can reach their own rows", () => {
  it("reads their own brand and invoice", async () => {
    const { data: brands } = await alice.client.from("brands").select("id");
    expect(brands!.map((b) => b.id)).toContain(aliceBrandId);

    const { data: invoices } = await alice.client.from("invoices").select("id");
    expect(invoices!.map((i) => i.id)).toContain(aliceInvoiceId);
  });
});

describe("cross-tenant reads return nothing", () => {
  for (const table of [
    "orgs",
    "brands",
    "clients",
    "invoices",
    "invoice_items",
    "email_templates",
  ]) {
    it(`${table}: bob sees none of alice's rows`, async () => {
      const { data, error } = await bob.client.from(table).select("*");
      expect(error).toBeNull();
      // Bob's org is brand new and empty, and alice's rows must be invisible.
      expect(data).toEqual(table === "orgs" ? [expect.objectContaining({ id: bob.orgId })] : []);
    });
  }
});

describe("cross-tenant writes are rejected", () => {
  it("bob cannot insert into alice's org", async () => {
    const { error } = await bob.client.from("brands").insert({
      org_id: alice.orgId,
      name: "Hostile Brand",
      invoice_prefix: "HX",
      accent_color: "#000000",
    });
    expect(error).not.toBeNull();
  });

  it("bob cannot update alice's invoice", async () => {
    const { data, error } = await bob.client
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", aliceInvoiceId)
      .select();

    // No SELECT visibility means the update matches zero rows.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await admin
      .from("invoices")
      .select("status")
      .eq("id", aliceInvoiceId)
      .single();
    expect(unchanged!.status).toBe("draft");
  });

  it("bob cannot delete alice's invoice", async () => {
    await bob.client.from("invoices").delete().eq("id", aliceInvoiceId);

    const { data: stillThere } = await admin
      .from("invoices")
      .select("id")
      .eq("id", aliceInvoiceId)
      .single();
    expect(stillThere).not.toBeNull();
  });

  it("bob cannot reach alice's invoice_items through the parent", async () => {
    await admin.from("invoice_items").insert({
      invoice_id: aliceInvoiceId,
      position: 0,
      description: "Confidential line",
      amount: "5000.00",
      tax: "0",
    });

    const { data } = await bob.client
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", aliceInvoiceId);
    expect(data).toEqual([]);
  });
});

describe("a user cannot move their own row to another org", () => {
  it("rejects reassigning org_id on update", async () => {
    const { data, error } = await alice.client
      .from("brands")
      .update({ org_id: bob.orgId })
      .eq("id", aliceBrandId)
      .select();

    // WITH CHECK rejects the new row. Either an error, or zero rows changed.
    if (!error) expect(data).toEqual([]);

    const { data: brand } = await admin
      .from("brands")
      .select("org_id")
      .eq("id", aliceBrandId)
      .single();
    expect(brand!.org_id).toBe(alice.orgId);
  });
});

describe("the RLS helper is not a public endpoint", () => {
  it("cannot be called directly by an authenticated user", async () => {
    const { error } = await alice.client.rpc("is_org_member", { p_org_id: alice.orgId });
    expect(error).not.toBeNull();
  });
});
