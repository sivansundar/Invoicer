import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeUser, type TestUser } from "./helpers";
import type { Brand, Client, EmailTemplate } from "@/lib/types";

/**
 * `src/lib/storage.ts` against a real database.
 *
 * The unit suite drives an in-memory fake of this module, so this file is
 * where the actual queries, the mappers, and PostgREST's encoding are
 * exercised. Anything asserted here would be a guess in a mocked test:
 * whether a numeric survives the round trip, whether a null column reads
 * back as undefined, whether RLS hides another tenant's row.
 */

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
    nextInvoiceNumber: 1,
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

    const saved = await storage.saveBrand(original);
    expect(saved).toEqual(original);

    const read = await storage.getBrand(original.id);
    // bank_details and followup are jsonb — this is what proves they survive
    // the trip as structured values rather than stringified blobs.
    expect(read).toEqual(original);
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
