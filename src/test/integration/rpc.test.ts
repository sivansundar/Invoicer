import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

/**
 * `create_invoice` / `update_invoice`.
 *
 * The claims worth proving here are the ones that only fail under
 * concurrency or partial failure — exactly what a mocked test cannot reach.
 */

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([makeUser(), makeUser()]);
});

async function makeBrand(user: TestUser, prefix: string): Promise<string> {
  const { data, error } = await user.client
    .from("brands")
    .insert({ name: `Brand ${prefix}`, invoice_prefix: prefix, accent_color: "#2563eb" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function payload(brandId: string, overrides: Record<string, unknown> = {}) {
  return {
    brand_id: brandId,
    currency: "INR",
    bill_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "sent",
    client_snapshot: { companyName: "Acme Studio", address: "12 Residency Rd" },
    brand_snapshot: { name: "Brand", invoicePrefix: "XX" },
    subtotal: 40000,
    total_tax: 7200,
    total: 47200,
    items: [
      { description: "Design work", amount: 30000, tax: 18 },
      { description: "Revisions", amount: 10000, tax: 18 },
    ],
    ...overrides,
  };
}

describe("create_invoice — numbering", () => {
  it("allocates the first sequence as 001 and formats the number from the brand prefix", async () => {
    const brandId = await makeBrand(alice, "AA");

    const { data, error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    expect(error).toBeNull();
    expect(data.invoice_number).toBe("AA-2026-001");
    expect(data.number_year).toBe(2026);
    expect(data.number_seq).toBe(1);
  });

  it("increments per brand and per year, not globally", async () => {
    const first = await makeBrand(alice, "BB");
    const second = await makeBrand(alice, "CC");

    await alice.client.rpc("create_invoice", { payload: payload(first) });
    await alice.client.rpc("create_invoice", { payload: payload(first) });
    const { data: otherBrand } = await alice.client.rpc("create_invoice", {
      payload: payload(second),
    });
    const { data: otherYear } = await alice.client.rpc("create_invoice", {
      payload: payload(first, { bill_date: "2027-01-04", due_date: "2027-01-18" }),
    });

    // A second brand starts its own sequence at 1...
    expect(otherBrand.invoice_number).toBe("CC-2026-001");
    // ...and so does a new financial year on a brand that already has three.
    expect(otherYear.invoice_number).toBe("BB-2027-001");
  });

  it("issues distinct, gapless numbers under concurrent calls", async () => {
    // The whole point of the RPC. With the client-side max() this replaces,
    // these calls all read the same highest sequence and collide.
    const brandId = await makeBrand(alice, "DD");
    const CONCURRENT = 12;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        alice.client.rpc("create_invoice", { payload: payload(brandId) })
      )
    );

    const errors = results.map((r) => r.error).filter(Boolean);
    expect(errors).toEqual([]);

    const sequences = results.map((r) => r.data.number_seq).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: CONCURRENT }, (_, i) => i + 1));

    // And the rendered numbers are unique, which is what actually reaches a
    // client's inbox.
    const numbers = results.map((r) => r.data.invoice_number);
    expect(new Set(numbers).size).toBe(CONCURRENT);
  });

  it("does not serialise against another org's creates", async () => {
    // The lock is on a brand row, and RLS decides which brand rows are
    // lockable — so one org's burst cannot block another's.
    const mine = await makeBrand(alice, "EE");
    const theirs = await makeBrand(bob, "FF");

    const results = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        alice.client.rpc("create_invoice", { payload: payload(mine) })
      ),
      ...Array.from({ length: 4 }, () =>
        bob.client.rpc("create_invoice", { payload: payload(theirs) })
      ),
    ]);

    expect(results.map((r) => r.error).filter(Boolean)).toEqual([]);
    expect(results.slice(0, 4).map((r) => r.data.number_seq).sort()).toEqual([1, 2, 3, 4]);
    expect(results.slice(4).map((r) => r.data.number_seq).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("create_invoice — preserving a restored invoice's identity", () => {
  it("keeps the supplied number and id instead of allocating", async () => {
    const brandId = await makeBrand(alice, "PP");
    // Generated, not a literal: this suite never resets the database, so a
    // fixed id collides with the previous run's row on the primary key.
    const id = crypto.randomUUID();

    const { data, error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId, {
        id,
        invoice_number: "SC-2024-042",
        number_year: 2024,
        number_seq: 42,
      }),
    });

    expect(error).toBeNull();
    expect(data.id).toBe(id);
    expect(data.invoice_number).toBe("SC-2024-042");
    expect(data.number_seq).toBe(42);
  });

  it("stores a legacy number that will not parse, with no sequence", async () => {
    const brandId = await makeBrand(alice, "QQ");

    const { data, error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId, { invoice_number: "OLD/2019/7" }),
    });

    expect(error).toBeNull();
    expect(data.invoice_number).toBe("OLD/2019/7");
    expect(data.number_seq).toBeNull();
    expect(data.number_year).toBeNull();
  });

  it("still rejects a number that collides with one already issued", async () => {
    const brandId = await makeBrand(alice, "RR");
    const { data: first } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    const { error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId, { invoice_number: first.invoice_number }),
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });

  it("allocates as normal when no number is supplied, alongside preserved ones", async () => {
    // A restore drops an invoice numbered 007 into an empty brand; the next
    // allocated number must continue from it rather than restart at 001.
    const brandId = await makeBrand(alice, "SS");

    await alice.client.rpc("create_invoice", {
      payload: payload(brandId, {
        invoice_number: "SS-2026-007",
        number_year: 2026,
        number_seq: 7,
      }),
    });
    const { data: next } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    expect(next.invoice_number).toBe("SS-2026-008");
  });
});

describe("create_invoice — isolation", () => {
  it("refuses a brand belonging to another org", async () => {
    const theirs = await makeBrand(bob, "GG");

    const { error } = await alice.client.rpc("create_invoice", { payload: payload(theirs) });

    // Under security invoker the row is invisible rather than forbidden, so
    // this is "not found" — and the message must not confirm the id exists.
    expect(error).not.toBeNull();
    expect(error!.message).toContain("brand not found");
  });

  it("writes the invoice into the caller's own org", async () => {
    const brandId = await makeBrand(alice, "HH");

    const { data } = await alice.client.rpc("create_invoice", { payload: payload(brandId) });

    expect(data.org_id).toBe(alice.orgId);
  });

  it("is not callable anonymously", async () => {
    const anon = admin.rpc; // placeholder to keep the import used
    void anon;

    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { error } = await anonClient.rpc("create_invoice", {
      payload: payload("00000000-0000-4000-8000-000000000000"),
    });

    expect(error).not.toBeNull();
  });
});

describe("create_invoice — line items", () => {
  it("stores items in payload order, positioned from zero", async () => {
    const brandId = await makeBrand(alice, "II");

    const { data: invoice } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    const { data: items } = await alice.client
      .from("invoice_items")
      .select("position, description, amount, tax")
      .eq("invoice_id", invoice.id)
      .order("position");

    expect(items).toEqual([
      { position: 0, description: "Design work", amount: 30000, tax: 18 },
      { position: 1, description: "Revisions", amount: 10000, tax: 18 },
    ]);
  });

  it("accepts an invoice with no items", async () => {
    const brandId = await makeBrand(alice, "JJ");

    const { data, error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId, { items: [] }),
    });

    expect(error).toBeNull();
    const { data: items } = await alice.client
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", data.id);
    expect(items).toEqual([]);
  });

  it("leaves no invoice behind when an item is malformed", async () => {
    // Atomicity: the invoice row is inserted before the items, so a failure
    // expanding them must take the invoice with it rather than leaving a
    // total with nothing behind it.
    const brandId = await makeBrand(alice, "KK");

    const { error } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId, { items: [{ description: "Bad", amount: "not-a-number" }] }),
    });

    expect(error).not.toBeNull();

    const { data: invoices } = await alice.client
      .from("invoices")
      .select("id")
      .eq("brand_id", brandId);
    expect(invoices).toEqual([]);
  });
});

describe("update_invoice", () => {
  it("replaces the item set wholesale", async () => {
    const brandId = await makeBrand(alice, "LL");
    const { data: created } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    await alice.client.rpc("update_invoice", {
      payload: {
        id: created.id,
        items: [{ description: "Only this", amount: 5000, tax: 0 }],
        subtotal: 5000,
        total_tax: 0,
        total: 5000,
      },
    });

    const { data: items } = await alice.client
      .from("invoice_items")
      .select("position, description, amount")
      .eq("invoice_id", created.id)
      .order("position");

    expect(items).toEqual([{ position: 0, description: "Only this", amount: 5000 }]);
  });

  it("never reallocates the invoice number", async () => {
    const brandId = await makeBrand(alice, "MM");
    const { data: created } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    const { data: updated } = await alice.client.rpc("update_invoice", {
      payload: { id: created.id, status: "paid", paid_on: "2026-06-20", items: [] },
    });

    expect(updated.invoice_number).toBe(created.invoice_number);
    expect(updated.number_seq).toBe(created.number_seq);
    expect(updated.number_year).toBe(created.number_year);
    expect(updated.status).toBe("paid");
    expect(updated.paid_on).toBe("2026-06-20");
  });

  it("leaves the original items intact when the update fails partway", async () => {
    const brandId = await makeBrand(alice, "NN");
    const { data: created } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    const { error } = await alice.client.rpc("update_invoice", {
      payload: {
        id: created.id,
        items: [
          { description: "Fine", amount: 100, tax: 0 },
          { description: "Broken", amount: "not-a-number", tax: 0 },
        ],
      },
    });

    expect(error).not.toBeNull();

    // The delete and the re-insert are in one transaction, so a failure in
    // the second must roll back the first. Without that, this invoice would
    // now have one item, or none.
    const { data: items } = await alice.client
      .from("invoice_items")
      .select("description")
      .eq("invoice_id", created.id)
      .order("position");
    expect(items!.map((i) => i.description)).toEqual(["Design work", "Revisions"]);
  });

  it("refuses another org's invoice rather than silently affecting nothing", async () => {
    const brandId = await makeBrand(alice, "OO");
    const { data: created } = await alice.client.rpc("create_invoice", {
      payload: payload(brandId),
    });

    const { error } = await bob.client.rpc("update_invoice", {
      payload: { id: created.id, status: "paid", items: [] },
    });

    // An UPDATE that matches zero rows under RLS reports no error at all —
    // the caller would be told their edit succeeded.
    expect(error).not.toBeNull();
    expect(error!.message).toContain("invoice not found");

    const { data: untouched } = await admin
      .from("invoices")
      .select("status")
      .eq("id", created.id)
      .single();
    expect(untouched!.status).toBe("sent");
  });
});
