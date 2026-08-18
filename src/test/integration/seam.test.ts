import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeUser, type TestUser } from "./helpers";
import type { Brand, Client, EmailTemplate, Invoice } from "@/lib/types";

/**
 * `src/lib/storage.ts` against a real database.
 *
 * The unit suite drives an in-memory fake of this module, so this file is
 * where the actual queries, the mappers, and PostgREST's encoding are
 * exercised. Anything asserted here would be a guess in a mocked test:
 * whether a numeric survives the round trip, whether a null column reads
 * back as undefined, whether RLS hides another tenant's row.
 */

// A valid 1x1 transparent PNG, base64-encoded — real bytes, so
// `dataUrlToBytes`/`sha256Hex` exercise the actual decode-and-hash path
// rather than an arbitrary string standing in for one.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let alice: TestUser;
let bob: TestUser;

// storage.ts builds its client from the NEXT_PUBLIC_* pair via
// createBrowserClient. Point that at the signed-in test user's client so the
// module under test is the real one, running as a real authenticated user.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => alice.client,
}));

const storage = await import("@/lib/storage");

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: crypto.randomUUID(),
    name: "Sivan Studio",
    address: "44, 100 Feet Rd",
    email: "billing@sivan.studio",
    phone: "+91 99999 99999",
    gstNumber: "29ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    logo: "data:image/png;base64,iVBORw0KGgo=",
    bankDetails: {
      accountName: "Sivan Studio",
      accountNumber: "50100234914210",
      bankName: "HDFC Bank",
      ifscCode: "HDFC0001234",
    },
    invoicePrefix: "SC",
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: true,
      mode: "custom",
      weekday: 3,
      time: "09:30",
      repeat: "month",
      templateId: "",
      stopAfter: 4,
    },
    invoiceDesign: "classic",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: crypto.randomUUID(),
    companyName: "Acme Studio",
    name: "Priya Nair",
    address: "12 Residency Rd",
    email: "priya@acme.test",
    phone: "+91 88888 88888",
    gstNumber: "29ZZZZZ1234F1Z5",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: crypto.randomUUID(),
    name: "Gentle nudge",
    subject: "Invoice {{number}}",
    tone: "Friendly",
    body: "Hi {{client}}, just a nudge.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([makeUser(), makeUser()]);
});

describe("brands through the seam", () => {
  it("round-trips every field, including the jsonb ones", async () => {
    const original = brand();

    // The fixture's default `logo` is a fresh data URL, which `saveBrand`
    // uploads and replaces with a path rather than round-tripping verbatim
    // — see the dedicated logo tests below for that behaviour on its own.
    const saved = await storage.saveBrand(original);
    expect(saved).toEqual({ ...original, logo: undefined, logoPath: saved.logoPath });
    expect(saved.logoPath).toMatch(/\.png$/);

    const read = await storage.getBrand(original.id);
    // bank_details and followup are jsonb — this is what proves they survive
    // the trip as structured values rather than stringified blobs.
    expect(read).toEqual(saved);
    expect(read!.bankDetails.ifscCode).toBe("HDFC0001234");
    expect(read!.followup.weekday).toBe(3);
  });

  it("round-trips a brand with every optional field absent", async () => {
    const original = brand({
      phone: undefined,
      gstNumber: undefined,
      panNumber: undefined,
      logo: undefined,
    });

    await storage.saveBrand(original);

    expect(await storage.getBrand(original.id)).toEqual(original);
  });

  it("updates in place rather than inserting a duplicate", async () => {
    const original = brand({ name: "Before" });
    await storage.saveBrand(original);

    await storage.saveBrand({ ...original, name: "After" });

    const all = await storage.getBrands();
    expect(all.filter((b) => b.id === original.id)).toHaveLength(1);
    expect((await storage.getBrand(original.id))!.name).toBe("After");
  });

  it("clears a field that was previously set", async () => {
    // The PostgREST trap the mappers exist to avoid: an absent key means
    // "leave the column alone", so removing a GST number has to send null.
    const original = brand({ gstNumber: "29ABCDE1234F1Z5" });
    await storage.saveBrand(original);

    await storage.saveBrand({ ...original, gstNumber: undefined });

    expect((await storage.getBrand(original.id))!.gstNumber).toBeUndefined();
  });

  it("deletes", async () => {
    const original = brand();
    await storage.saveBrand(original);

    await storage.deleteBrand(original.id);

    expect(await storage.getBrand(original.id)).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(await storage.getBrand(crypto.randomUUID())).toBeNull();
  });

  it("uploads a logo and reads it back as a signed URL", async () => {
    const created = brand({ logo: TINY_PNG_DATA_URL });
    const saved = await storage.saveBrand(created);

    expect(saved.logoPath).toMatch(new RegExp(`^${saved.id}/[0-9a-f]{64}\\.png$`));
    expect(saved.logo).toBeUndefined();
    await expect(storage.getLogoUrl(saved.logoPath!)).resolves.toContain(saved.logoPath);
  });

  it("re-uploading identical bytes is idempotent, not a conflict", async () => {
    const first = await storage.saveBrand(brand({ logo: TINY_PNG_DATA_URL }));
    const second = await storage.saveBrand({ ...first, logo: TINY_PNG_DATA_URL });

    // Asserted before the equality check on purpose: without it, a
    // `saveBrand` that never uploads at all would leave both sides
    // `undefined` and pass this test for the wrong reason.
    expect(first.logoPath).toMatch(/\.png$/);
    expect(second.logoPath).toBe(first.logoPath);
  });

  it("commits the row's other edited fields even when the logo upload step fails afterward", async () => {
    // `saveBrand` is two writes, not one transaction (see its doc comment):
    // the whole row lands first, then the logo upload, then a second write
    // that swaps logo_data for logo_path. This pins what a caller actually
    // gets when the second half fails — the promise still rejects, but the
    // first write is not rolled back.
    const created = await storage.saveBrand(brand({ phone: "+91 70000 00000", logo: undefined }));

    // Forces the upload call itself to fail — a real object-store outage,
    // not an RLS denial — without touching the `.from("brands")` calls the
    // row writes go through, so both of those stay genuinely real.
    const fromSpy = vi.spyOn(alice.client.storage, "from").mockReturnValue({
      upload: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "simulated storage outage" } }),
    } as never);

    // Caught rather than asserted with `.rejects.toThrow()` so the rejection
    // itself — not just the fact that one happened — can be inspected below:
    // this is what pins the real `LogoUploadError` class and its payload,
    // not just the fake's mirror of them.
    let caught: unknown;
    try {
      await storage.saveBrand({ ...created, phone: "+91 60000 00000", logo: TINY_PNG_DATA_URL });
    } catch (err) {
      caught = err;
    } finally {
      fromSpy.mockRestore();
    }

    expect(caught).toBeInstanceOf(storage.LogoUploadError);
    // `err.brand` is the row the first write already committed — pinning
    // that it carries a field edited in this very call (not a stale read of
    // `created`) is what proves the commit-before-upload ordering the doc
    // comment on `saveBrand` describes, not just that *some* row survives.
    expect((caught as InstanceType<typeof storage.LogoUploadError>).brand.phone).toBe(
      "+91 60000 00000"
    );

    // The rejection is honest about the logo, but not about the rest of the
    // call: the phone edit from the failed call is durably committed...
    const persisted = await storage.getBrand(created.id);
    expect(persisted!.phone).toBe("+91 60000 00000");
    // ...and the fresh logo survives too, just not migrated — it's still
    // sitting in logo_data exactly as submitted, which is what lets the
    // brand keep rendering a logo instead of losing it.
    expect(persisted!.logo).toBe(TINY_PNG_DATA_URL);
    expect(persisted!.logoPath).toBeUndefined();
  });

  it("never returns another org's brands", async () => {
    const mine = brand({ name: "Mine" });
    await storage.saveBrand(mine);

    const { error } = await bob.client
      .from("brands")
      .insert({ name: "Theirs", invoice_prefix: "TH", accent_color: "#000000" });
    expect(error).toBeNull();

    const all = await storage.getBrands();
    expect(all.map((b) => b.name)).toContain("Mine");
    expect(all.map((b) => b.name)).not.toContain("Theirs");
  });
});

describe("clients through the seam", () => {
  it("round-trips every field", async () => {
    const original = client();

    await storage.saveClient(original);

    expect(await storage.getClient(original.id)).toEqual(original);
  });

  it("round-trips with optionals absent", async () => {
    const original = client({
      name: undefined,
      email: undefined,
      phone: undefined,
      gstNumber: undefined,
    });

    await storage.saveClient(original);

    expect(await storage.getClient(original.id)).toEqual(original);
  });

  it("deletes", async () => {
    const original = client();
    await storage.saveClient(original);

    await storage.deleteClient(original.id);

    expect(await storage.getClient(original.id)).toBeNull();
  });
});

describe("templates through the seam", () => {
  it("round-trips every field", async () => {
    const original = template();

    await storage.saveTemplate(original);

    const all = await storage.getTemplates();
    expect(all.find((t) => t.id === original.id)).toEqual(original);
  });

  it("deletes", async () => {
    const original = template();
    await storage.saveTemplate(original);

    await storage.deleteTemplate(original.id);

    expect((await storage.getTemplates()).find((t) => t.id === original.id)).toBeUndefined();
  });
});

describe("invoices through the seam", () => {
  function draft(brandId: string, overrides: Partial<Invoice> = {}): Invoice {
    return {
      id: crypto.randomUUID(),
      // Provisional: the server allocates the real one on create.
      invoiceNumber: "XX-2026-001",
      brandId,
      clientId: null,
      currency: "INR",
      status: "sent",
      billDate: "2026-06-01",
      dueDate: "2026-06-15",
      client: { companyName: "Acme Studio", address: "12 Residency Rd" },
      items: [
        { id: crypto.randomUUID(), description: "Design work", amount: 30000, tax: 18 },
        { id: crypto.randomUUID(), description: "Revisions", amount: 10000.55, tax: 5.5 },
      ],
      subtotal: 40000.55,
      totalTax: 7200.03,
      total: 47200.58,
      notes: "Thanks!",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      brandSnapshot: {
        name: "Seam Brand",
        address: "44, 100 Feet Rd",
        invoicePrefix: "SM",
        accentColor: "#2563eb",
        invoiceDesign: "modern",
        bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
      },
      reminders: [],
      followupsPaused: false,
      ...overrides,
    };
  }

  async function seamBrand(prefix: string): Promise<string> {
    const b = brand({ invoicePrefix: prefix });
    await storage.saveBrand(b);
    return b.id;
  }

  it("returns the number the server issued, not the provisional one", async () => {
    const brandId = await seamBrand("SM");

    const created = await storage.createInvoice(draft(brandId));

    expect(created.invoiceNumber).toBe("SM-2026-001");
    expect(created.invoiceNumber).not.toBe("XX-2026-001");
  });

  it("round-trips money exactly, including fractional amounts", async () => {
    // The Global Constraint this pins: numeric(14,2) must survive PostgREST's
    // JSON encoding as an exact value, not a float approximation.
    const brandId = await seamBrand("MN");

    const created = await storage.createInvoice(draft(brandId));
    const read = await storage.getInvoice(created.id);

    expect(read!.subtotal).toBe(40000.55);
    expect(read!.total).toBe(47200.58);
    expect(read!.items[1].amount).toBe(10000.55);
    expect(read!.items[1].tax).toBe(5.5);
    // Numbers, not strings — a caller doing arithmetic on these must not
    // silently concatenate instead.
    expect(typeof read!.total).toBe("number");
    expect(typeof read!.items[0].amount).toBe("number");
  });

  it("reads line items back in the order they were sent", async () => {
    const brandId = await seamBrand("OR");

    const created = await storage.createInvoice(draft(brandId));
    const read = await storage.getInvoice(created.id);

    expect(read!.items.map((i) => i.description)).toEqual(["Design work", "Revisions"]);
  });

  it("round-trips dates without shifting them across a timezone", async () => {
    // `date` columns have no timezone. Passing them through Date() would
    // move a bill date to the previous day for anyone west of UTC.
    const brandId = await seamBrand("DT");

    const created = await storage.createInvoice(
      draft(brandId, { billDate: "2026-01-01", dueDate: "2026-12-31" })
    );
    const read = await storage.getInvoice(created.id);

    expect(read!.billDate).toBe("2026-01-01");
    expect(read!.dueDate).toBe("2026-12-31");
  });

  it("updates without touching the number, and replaces items", async () => {
    const brandId = await seamBrand("UP");
    const created = await storage.createInvoice(draft(brandId));

    const updated = await storage.saveInvoice({
      ...created,
      status: "paid",
      paidOn: "2026-06-20",
      items: [{ id: crypto.randomUUID(), description: "Only this", amount: 500, tax: 0 }],
      subtotal: 500,
      totalTax: 0,
      total: 500,
    });

    expect(updated.invoiceNumber).toBe(created.invoiceNumber);

    const read = await storage.getInvoice(created.id);
    expect(read!.status).toBe("paid");
    expect(read!.paidOn).toBe("2026-06-20");
    expect(read!.items.map((i) => i.description)).toEqual(["Only this"]);
  });

  it("preserves a restored invoice's own number and id", async () => {
    const brandId = await seamBrand("RS");
    const id = crypto.randomUUID();

    const restored = await storage.createInvoice(
      draft(brandId, { id, invoiceNumber: "RS-2019-042" }),
      { preserveNumber: true }
    );

    expect(restored.id).toBe(id);
    expect(restored.invoiceNumber).toBe("RS-2019-042");
  });

  it("deletes, taking its line items with it", async () => {
    const brandId = await seamBrand("DL");
    const created = await storage.createInvoice(draft(brandId));

    await storage.deleteInvoice(created.id);

    expect(await storage.getInvoice(created.id)).toBeNull();
    const { data: orphans } = await alice.client
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", created.id);
    expect(orphans).toEqual([]);
  });

  it("never returns another org's invoices", async () => {
    const brandId = await seamBrand("IS");
    await storage.createInvoice(draft(brandId));

    const theirBrand = await bob.client
      .from("brands")
      .insert({ name: "Theirs", invoice_prefix: "TT", accent_color: "#000000" })
      .select("id")
      .single();
    await bob.client.rpc("create_invoice", {
      payload: {
        brand_id: theirBrand.data!.id,
        currency: "INR",
        bill_date: "2026-06-01",
        due_date: "2026-06-15",
        client_snapshot: {},
        brand_snapshot: {},
        items: [],
      },
    });

    const mine = await storage.getInvoices();
    expect(mine.every((i) => i.brandSnapshot.invoicePrefix !== "TT")).toBe(true);
    expect(mine.some((i) => i.brandId === theirBrand.data!.id)).toBe(false);
  });
});

describe("failures surface as rejections", () => {
  it("rejects rather than resolving falsy when a write is refused", async () => {
    // A check-constraint violation stands in for any server-side refusal:
    // what matters is that the caller sees a rejected promise, since the
    // forms now branch on try/catch rather than on a boolean.
    await expect(
      storage.saveBrand(brand({ invoiceDesign: "not-a-design" as never }))
    ).rejects.toThrow();
  });
});
