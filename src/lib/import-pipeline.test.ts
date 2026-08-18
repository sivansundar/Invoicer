import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeImport, type PendingConflict } from "./import-pipeline";
import {
  resetFakeSeam,
  seed,
  getInvoices,
  getBrands,
  getClients,
  getTemplates,
} from "@/test/fake-seam";
import { validBrand as brand } from "@/test/factories";
import type { Invoice } from "./types";

// Same fake as `import-export.test.tsx` — this exercises `writeImport`
// directly, without a dialog, so it can pin the write step's own contract
// independent of any UI.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "aaaaaaa1-0000-4000-8000-000000000001",
    invoiceNumber: "INV-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme Studio", address: "" },
    items: [{ id: "li1", description: "Design work", amount: 1000, tax: 18 }],
    subtotal: 1000,
    totalTax: 180,
    total: 1180,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    brandSnapshot: {
      name: "Sivan Studio",
      address: "",
      invoicePrefix: "SC",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

describe("writeImport — a resolved conflict is applied to the row the caller captured", () => {
  beforeEach(() => {
    resetFakeSeam();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Pins the regression a Task 6 review caught: `writeInvoices` used to
   * re-derive "is this incoming invoice a conflict, and with what row" from
   * a fresh `getInvoices()` call matched by invoice number, instead of
   * trusting the `PendingConflict` the caller had already captured (and
   * shown the user, and gotten an answer for). When the fresh lookup came
   * up empty — here, because nothing was ever seeded, standing in for "the
   * row is gone by write time" — the incoming invoice fell through to the
   * unconditional-create branch, silently turning a user's `discard` into a
   * create. `conflicts` (the captured pairing) exists precisely so this
   * can't happen: an incoming invoice's fate is decided by identity against
   * what the caller already resolved, never re-checked against the database.
   */
  it("honours a discard even when the matching invoice can't be found by a fresh lookup", async () => {
    const existing = invoice({ id: "existing-id", invoiceNumber: "INV-001" });
    const incoming = invoice({ id: "incoming-id", invoiceNumber: "INV-001" });
    const conflict: PendingConflict = { incoming, existing };

    // Deliberately nothing seeded: a self-detecting `getInvoices()` lookup
    // by number would find no match at all for "INV-001".
    const result = await writeImport(
      { brands: [], clients: [], templates: [], invoices: [incoming] },
      {
        remappedIds: 0,
        conflicts: [conflict],
        onConflict: () => ({ action: "discard" }),
      }
    );

    expect(result.invoices).toEqual({
      imported: 0,
      overwritten: 0,
      renamed: 0,
      discarded: 1,
      failed: 0,
    });
    expect(await getInvoices()).toHaveLength(0);
  });
});

describe("writeImport — skips the lookup for a collection with nothing incoming", () => {
  beforeEach(() => {
    resetFakeSeam();
    // `resetFakeSeam` wipes the in-memory data and the fake's own
    // failure-arming state, but not each export's `vi.fn()` call history —
    // these tests assert on that history directly.
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * `import-export.tsx`'s backup-envelope path calls `writeImport` with
   * `invoices: []` while brands/clients/templates are the real, non-empty
   * collections — brands/clients/templates get their own invoice-conflict-
   * free write, and the invoice conflict dialog (if there is one) runs
   * separately. `getInvoices()` has nothing to match against in that call,
   * so it must not run at all: beyond the wasted round trip, a failure of
   * it would reject the whole import after brands/clients/templates had
   * already landed, and the caller would report "Import failed" with no
   * summary of what actually made it in.
   */
  it("does not call getInvoices() when the incoming invoices collection is empty", async () => {
    await writeImport(
      { brands: [], clients: [], templates: [], invoices: [] },
      { remappedIds: 0 }
    );

    expect(getInvoices).not.toHaveBeenCalled();
  });

  /**
   * The mirror image — the local-data prompt's invoices-only call (and the
   * file importer's, once conflicts are resolved) passes empty
   * brands/clients/templates. Each of those collections' existing-id
   * lookups is pointless when nothing incoming could possibly match it.
   */
  it("does not call getBrands/getClients/getTemplates when their incoming collections are empty", async () => {
    const incoming: Invoice = {
      id: "aaaaaaa1-0000-4000-8000-000000000001",
      invoiceNumber: "INV-001",
      brandId: "b1",
      currency: "INR",
      status: "sent",
      billDate: "2026-06-01",
      dueDate: "2026-06-15",
      client: { companyName: "Acme Studio", address: "" },
      items: [],
      subtotal: 0,
      totalTax: 0,
      total: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      brandSnapshot: {
        name: "Sivan Studio",
        address: "",
        invoicePrefix: "SC",
        accentColor: "#2563eb",
        invoiceDesign: "modern",
        bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
      },
      clientId: null,
      reminders: [],
      followupsPaused: false,
    };

    await writeImport(
      { brands: [], clients: [], templates: [], invoices: [incoming] },
      { remappedIds: 0 }
    );

    expect(getBrands).not.toHaveBeenCalled();
    expect(getClients).not.toHaveBeenCalled();
    expect(getTemplates).not.toHaveBeenCalled();
    // The one lookup that IS needed here still ran.
    expect(getInvoices).toHaveBeenCalledTimes(1);
  });
});

describe("writeImport — conflict detection is scoped per brand", () => {
  beforeEach(() => {
    resetFakeSeam();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not treat the same number under a different brand as a conflict", async () => {
    // `invoices_number_unique` is (org_id, brand_id, invoice_number). Two
    // brands sharing an invoicePrefix legitimately hold the same number, so
    // matching on the number alone finds a collision the database would
    // never have rejected — and "overwrite" would write one brand's invoice
    // over the other brand's row.
    seed({
      brands: [brand({ id: "brand-a" }), brand({ id: "brand-b" })],
      invoices: [
        invoice({ id: "existing-id", brandId: "brand-b", invoiceNumber: "INV-2026-001" }),
      ],
    });

    const onConflict = vi.fn(() => ({ action: "discard" }) as const);

    const summary = await writeImport(
      {
        brands: [],
        clients: [],
        templates: [],
        invoices: [
          invoice({ id: "incoming-id", brandId: "brand-a", invoiceNumber: "INV-2026-001" }),
        ],
      },
      { remappedIds: 0, onConflict }
    );

    expect(onConflict).not.toHaveBeenCalled();
    expect(summary.invoices.imported).toBe(1);
    expect(summary.invoices.discarded).toBe(0);

    const stored = await getInvoices();
    expect(stored).toHaveLength(2);
    expect(stored.find((i) => i.brandId === "brand-b")!.id).toBe("existing-id");
  });

  it("still detects a conflict when the brand matches too", async () => {
    // The other half of the same behaviour — narrowing the key must not stop
    // a real collision from being found.
    seed({
      brands: [brand({ id: "brand-a" })],
      invoices: [
        invoice({ id: "existing-id", brandId: "brand-a", invoiceNumber: "INV-2026-001" }),
      ],
    });

    const onConflict = vi.fn(() => ({ action: "discard" }) as const);

    const summary = await writeImport(
      {
        brands: [],
        clients: [],
        templates: [],
        invoices: [
          invoice({ id: "incoming-id", brandId: "brand-a", invoiceNumber: "INV-2026-001" }),
        ],
      },
      { remappedIds: 0, onConflict }
    );

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(summary.invoices.discarded).toBe(1);
  });
});
