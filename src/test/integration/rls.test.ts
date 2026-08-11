import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let aliceBrandId: string;
let aliceInvoiceId: string;
let aliceClientId: string;
let aliceEmailTemplateId: string;
let aliceInvoiceItemId: string;

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

  const { data: client, error: clientError } = await alice.client
    .from("clients")
    .insert({
      org_id: alice.orgId,
      company_name: "Alice Client Co",
    })
    .select()
    .single();
  if (clientError) throw clientError;
  aliceClientId = client.id;

  const { data: emailTemplate, error: emailTemplateError } = await alice.client
    .from("email_templates")
    .insert({
      org_id: alice.orgId,
      name: "Reminder",
      subject: "Invoice due",
      tone: "Friendly",
      body: "Please pay your invoice.",
    })
    .select()
    .single();
  if (emailTemplateError) throw emailTemplateError;
  aliceEmailTemplateId = emailTemplate.id;

  const { data: invoiceItem, error: invoiceItemError } = await alice.client
    .from("invoice_items")
    .insert({
      invoice_id: aliceInvoiceId,
      position: 0,
      description: "Design work",
      amount: "5000.00",
      tax: "0",
    })
    .select()
    .single();
  if (invoiceItemError) throw invoiceItemError;
  aliceInvoiceItemId = invoiceItem.id;
});

describe("a user can reach their own rows", () => {
  it("reads their own brand and invoice", async () => {
    const { data: brands } = await alice.client.from("brands").select("id");
    expect(brands!.map((b) => b.id)).toContain(aliceBrandId);

    const { data: invoices } = await alice.client.from("invoices").select("id");
    expect(invoices!.map((i) => i.id)).toContain(aliceInvoiceId);
  });

  // Coverage for the tables the cross-tenant loop below only asserts the
  // negative for. A leak would already fail those tests, but a policy typo
  // that instead locks the owner out (e.g. `using (false)`) would pass them
  // silently — this task has hit exactly that failure mode twice already.
  it("reads their own client, email template, and invoice item", async () => {
    const { data: clients } = await alice.client.from("clients").select("id");
    expect(clients!.map((c) => c.id)).toContain(aliceClientId);

    const { data: emailTemplates } = await alice.client.from("email_templates").select("id");
    expect(emailTemplates!.map((t) => t.id)).toContain(aliceEmailTemplateId);

    const { data: invoiceItems } = await alice.client.from("invoice_items").select("id");
    expect(invoiceItems!.map((i) => i.id)).toContain(aliceInvoiceItemId);
  });
});

describe("cross-tenant reads return nothing", () => {
  for (const table of [
    "orgs",
    "org_members",
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
      // `orgs` and `org_members` are the two tables where Bob legitimately
      // sees exactly one row: his own org, and his own membership in it.
      // `org_members_select` is the one policy in the set that does not
      // route through `is_org_member` (it's `user_id = auth.uid()`), so it
      // is the least protected by the shared shape of the others and gets
      // its own explicit check here rather than being folded into "orgs".
      if (table === "orgs") {
        expect(data).toEqual([expect.objectContaining({ id: bob.orgId })]);
      } else if (table === "org_members") {
        expect(data).toEqual([expect.objectContaining({ org_id: bob.orgId })]);
      } else {
        expect(data).toEqual([]);
      }
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
    // This asserts *route* exposure, not the function's own execute ACL:
    // PostgREST resolves /rpc/<name> only against the `public` schema
    // (config.toml's `api.schemas`), and `is_org_member` lives in `private`,
    // so this 404s regardless of what `execute` is granted to. It would
    // pass identically if `execute` were granted to `anon`, or if the
    // function didn't exist at all. The function-level ACL (`authenticated`
    // only, `anon`/`public`/`service_role` revoked) is a separate property,
    // documented and reasoned about at the grant/revoke pairing in the
    // migration — this test does not exercise it.
    const { error } = await alice.client.rpc("is_org_member", { p_org_id: alice.orgId });
    expect(error).not.toBeNull();
  });
});
