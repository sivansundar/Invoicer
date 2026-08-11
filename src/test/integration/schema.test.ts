import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

let user: TestUser;

async function insertBrand(overrides: Record<string, unknown> = {}) {
  return admin
    .from("brands")
    .insert({
      org_id: user.orgId,
      name: "Acme Studio",
      invoice_prefix: "AC",
      accent_color: "#2563eb",
      ...overrides,
    })
    .select()
    .single();
}

beforeAll(async () => {
  user = await makeUser();
});

describe("domain schema", () => {
  it("round-trips a money value without precision loss", async () => {
    const { data: brand } = await insertBrand();
    const { data: invoice, error } = await admin
      .from("invoices")
      .insert({
        org_id: user.orgId,
        brand_id: brand!.id,
        invoice_number: "AC-2026-001",
        number_year: 2026,
        number_seq: 1,
        currency: "INR",
        bill_date: "2026-08-11",
        due_date: "2026-09-10",
        client_snapshot: { companyName: "Client Co" },
        brand_snapshot: { name: "Acme Studio" },
        total: "12345678.91",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(Number(invoice!.total)).toBe(12345678.91);
  });

  it("rejects an unknown status", async () => {
    const { data: brand } = await insertBrand();
    const { error } = await admin.from("invoices").insert({
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-002",
      status: "archived",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    });
    expect(error).not.toBeNull();
  });

  it("rejects a duplicate invoice number within one brand", async () => {
    const { data: brand } = await insertBrand();
    const row = {
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-010",
      number_year: 2026,
      number_seq: 10,
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    };
    const first = await admin.from("invoices").insert(row);
    expect(first.error).toBeNull();

    const second = await admin.from("invoices").insert(row);
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505"); // unique_violation
  });

  it("allows the same invoice number under a different brand", async () => {
    const a = await insertBrand({ invoice_prefix: "AA" });
    const b = await insertBrand({ invoice_prefix: "BB" });
    const row = {
      org_id: user.orgId,
      invoice_number: "SHARED-001",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    };
    expect((await admin.from("invoices").insert({ ...row, brand_id: a.data!.id })).error).toBeNull();
    expect((await admin.from("invoices").insert({ ...row, brand_id: b.data!.id })).error).toBeNull();
  });

  it("refuses to delete a brand that still has invoices", async () => {
    const { data: brand } = await insertBrand();
    await admin.from("invoices").insert({
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-020",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    });

    const { error } = await admin.from("brands").delete().eq("id", brand!.id);
    expect(error).not.toBeNull(); // on delete restrict
  });

  it("cascades invoice_items when the invoice is deleted", async () => {
    const { data: brand } = await insertBrand();
    const { data: invoice } = await admin
      .from("invoices")
      .insert({
        org_id: user.orgId,
        brand_id: brand!.id,
        invoice_number: "AC-2026-030",
        currency: "INR",
        bill_date: "2026-08-11",
        due_date: "2026-09-10",
        client_snapshot: {},
        brand_snapshot: {},
      })
      .select()
      .single();

    await admin.from("invoice_items").insert({
      invoice_id: invoice!.id,
      position: 0,
      description: "Design work",
      amount: "1000.00",
      tax: "18.00",
    });

    await admin.from("invoices").delete().eq("id", invoice!.id);

    const { data: items } = await admin
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", invoice!.id);
    expect(items).toEqual([]);
  });
});
