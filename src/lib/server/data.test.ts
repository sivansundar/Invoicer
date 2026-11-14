import { describe, expect, it } from "vitest";
import { deleteRecord, loadData, putRecord } from "./data";
import type { Db } from "./db";
import type { Brand, Invoice } from "@/lib/types";

type Row = Record<string, unknown> & { id: string };

/** Just enough of Prisma's model API for data.ts, over plain arrays. */
function table() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) =>
      k === "NOT" ? !matches(row, v as Record<string, unknown>) : row[k] === v
    );
  return {
    rows,
    findUnique: async ({ where }: { where: { id: string } }) =>
      rows.find((r) => r.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((r) => matches(r, where)),
    upsert: async ({ where, update, create }: { where: { id: string }; update: Row; create: Row }) => {
      const existing = rows.find((r) => r.id === where.id);
      if (existing) Object.assign(existing, update);
      else rows.push({ ...create });
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
    },
  };
}

function fakeDb() {
  const tables = { brand: table(), client: table(), invoice: table(), brandAccess: table(), expense: table() };
  return { db: tables as unknown as Db, tables };
}

const brand = (id: string): Brand => ({
  id,
  name: "Studio",
  address: "1 Road",
  email: "a@b.co",
  invoicePrefix: "SC",
  nextInvoiceNumber: 1,
  bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
  createdAt: "2026-01-01T00:00:00.000Z",
  accentColor: "#2563eb",
  followup: { enabled: false, mode: "weekly", weekday: 1, time: "09:00", repeat: "week", templateId: "", stopAfter: 0 },
  invoiceDesign: "modern",
});

const invoice = (id: string, brandId: string, invoiceNumber: string): Invoice => ({
  id,
  invoiceNumber,
  brandId,
  currency: "INR",
  status: "draft",
  billDate: "2026-06-01",
  dueDate: "2026-06-15",
  client: { companyName: "Acme", address: "2 Road" },
  items: [{ id: "l1", description: "Work", amount: 100, tax: 18 }],
  subtotal: 100,
  totalTax: 18,
  total: 118,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  brandSnapshot: {} as Invoice["brandSnapshot"],
  clientId: null,
  reminders: [],
  followupsPaused: false,
});

describe("server data rules", () => {
  it("saves and returns only the signed-in user's records", async () => {
    const { db } = fakeDb();
    expect((await putRecord(db, "sivan", "brands", "b1", brand("b1"))).status).toBe(200);
    expect((await putRecord(db, "other", "brands", "b2", brand("b2"))).status).toBe(200);

    expect((await loadData(db, "sivan")).brands.map((b) => b.id)).toEqual(["b1"]);
  });

  it("refuses to overwrite or delete a record owned by someone else", async () => {
    const { db, tables } = fakeDb();
    await putRecord(db, "sivan", "brands", "b1", brand("b1"));

    const result = await putRecord(db, "other", "brands", "b1", { ...brand("b1"), name: "Hijacked" });
    await deleteRecord(db, "other", "brands", "b1");

    expect(result.status).toBe(404);
    expect(tables.brand.rows).toHaveLength(1);
    expect(JSON.parse(tables.brand.rows[0].data as string).name).toBe("Studio");
  });

  it("refuses an invoice filed under someone else's brand", async () => {
    const { db, tables } = fakeDb();
    await putRecord(db, "sivan", "brands", "b1", brand("b1"));

    const result = await putRecord(db, "other", "invoices", "i9", invoice("i9", "b1", "SC-2026-009"));

    expect(result.status).toBe(403);
    expect(tables.invoice.rows).toHaveLength(0);
  });

  it("refuses a second invoice with the same number in a brand, but allows re-saving the first", async () => {
    const { db } = fakeDb();
    await putRecord(db, "sivan", "brands", "b1", brand("b1"));
    await putRecord(db, "sivan", "invoices", "i1", invoice("i1", "b1", "SC-2026-001"));

    const duplicate = await putRecord(db, "sivan", "invoices", "i2", invoice("i2", "b1", "SC-2026-001"));
    const resave = await putRecord(db, "sivan", "invoices", "i1", {
      ...invoice("i1", "b1", "SC-2026-001"),
      status: "sent",
    });

    expect(duplicate.status).toBe(409);
    expect(resave.status).toBe(200);
  });

  it("rejects a malformed record and one whose id disagrees with the URL", async () => {
    const { db } = fakeDb();
    expect((await putRecord(db, "sivan", "brands", "b1", { id: "b1" })).status).toBe(400);
    expect((await putRecord(db, "sivan", "brands", "b1", brand("b2"))).status).toBe(400);
  });
});

describe("sharing a brand", () => {
  async function shared(invoices: string, expenses = "none") {
    const { db, tables } = fakeDb();
    // The fake's upsert/findFirst key rows by `id`; shares have none, so seed directly.
    const share = (row: Record<string, unknown>) =>
      (tables as unknown as { brandAccess: ReturnType<typeof table> }).brandAccess.rows.push(row as Row);
    // updateMany for claimShares.
    Object.assign((tables as unknown as { brandAccess: object }).brandAccess, {
      updateMany: async ({ where, data }: { where: { email: { in: string[] } }; data: Row }) => {
        for (const r of (tables as unknown as { brandAccess: ReturnType<typeof table> }).brandAccess.rows) {
          if (r.userId === null && where.email.in.includes(r.email as string)) Object.assign(r, data);
        }
      },
    });
    await putRecord(db, "sivan", "brands", "b1", brand("b1"));
    await putRecord(db, "sivan", "brands", "b2", brand("b2"));
    await putRecord(db, "sivan", "invoices", "i1", invoice("i1", "b1", "SC-2026-001"));
    await putRecord(db, "sivan", "invoices", "i2", invoice("i2", "b2", "SC-2026-002"));
    share({ id: "s1", brandId: "b1", email: "ca@firm.in", userId: null, invoices, expenses });
    return { db, tables };
  }

  it("shows a guest only the shared brand and its invoices, never clients or other brands", async () => {
    const { db } = await shared("view");
    await putRecord(db, "sivan", "clients", "c1", {
      id: "c1",
      companyName: "Acme",
      address: "2 Road",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const data = await loadData(db, "ca", ["CA@firm.in"]);

    expect(data.brands.map((b) => b.id)).toEqual(["b1"]);
    expect(data.invoices.map((i) => i.id)).toEqual(["i1"]);
    expect(data.clients).toEqual([]);
    expect(data.permissions).toEqual({ b1: { invoices: "view", expenses: "none" } });
  });

  it("gives nothing to someone whose email is not verified as the invited one", async () => {
    const { db } = await shared("view");
    const data = await loadData(db, "stranger", ["someone@else.in"]);
    expect(data.brands).toEqual([]);
    expect(data.invoices).toEqual([]);
  });

  it("hides invoices when the share's invoice access is none", async () => {
    const { db } = await shared("none", "view");
    const data = await loadData(db, "ca", ["ca@firm.in"]);
    expect(data.brands.map((b) => b.id)).toEqual(["b1"]);
    expect(data.invoices).toEqual([]);
  });

  it("refuses a view-only guest's edit and delete", async () => {
    const { db, tables } = await shared("view");
    await loadData(db, "ca", ["ca@firm.in"]);

    const result = await putRecord(db, "ca", "invoices", "i1", {
      ...invoice("i1", "b1", "SC-2026-001"),
      status: "paid",
    });
    await deleteRecord(db, "ca", "invoices", "i1");

    expect(result.status).toBe(404);
    expect(JSON.parse(tables.invoice.rows.find((r) => r.id === "i1")!.data as string).status).toBe("draft");
  });

  it("lets a guest with edit access change invoices in that brand only, owned by the brand's owner", async () => {
    const { db, tables } = await shared("edit");
    await loadData(db, "ca", ["ca@firm.in"]);

    const edit = await putRecord(db, "ca", "invoices", "i1", { ...invoice("i1", "b1", "SC-2026-001"), status: "sent" });
    const created = await putRecord(db, "ca", "invoices", "i3", invoice("i3", "b1", "SC-2026-003"));
    const otherBrand = await putRecord(db, "ca", "invoices", "i2", { ...invoice("i2", "b2", "SC-2026-002"), status: "paid" });
    const moved = await putRecord(db, "ca", "invoices", "i1", invoice("i1", "b2", "SC-2026-009"));
    const brandEdit = await putRecord(db, "ca", "brands", "b1", { ...brand("b1"), name: "Hijacked" });

    expect(edit.status).toBe(200);
    expect(created.status).toBe(200);
    expect(tables.invoice.rows.find((r) => r.id === "i3")!.ownerId).toBe("sivan");
    expect(otherBrand.status).toBe(404);
    expect(moved.status).toBe(403);
    expect(brandEdit.status).toBe(404);
  });
});
