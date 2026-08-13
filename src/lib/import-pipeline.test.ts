import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeImport, type PendingConflict } from "./import-pipeline";
import { resetFakeSeam, getInvoices } from "@/test/fake-seam";
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
