import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport, buildBackup } from "./import-export";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import {
  validInvoice as invoice,
  validBrand as brand,
  validClient as client,
  validTemplate as template,
} from "@/test/factories";
import * as storage from "@/lib/storage";

// Brands, clients and templates are in Postgres now; invoices are not yet.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

function jsonFile(payload: unknown, name = "invoices.json"): File {
  return new File([JSON.stringify(payload)], name, { type: "application/json" });
}

function uploadFile(container: HTMLElement, payload: unknown, name = "invoices.json") {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [jsonFile(payload, name)] } });
}

describe("ImportExport — rename conflict resolution", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables Confirm on the prefilled (still-colliding) value, and it never overwrites the existing invoice", async () => {
    seed({ invoices: [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000e1", invoiceNumber: "INV-001" })] });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000f1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    // Prefilled with the exact number that's already taken.
    expect(screen.getByPlaceholderText("e.g. INV-042")).toHaveValue("INV-001");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(
      screen.getByText("That invoice number is already in use — choose a different one.")
    ).toBeInTheDocument();
  });

  it("stays disabled when edited to a number that collides with a different existing invoice", async () => {
    seed({ invoices: [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000e1", invoiceNumber: "INV-001" }), invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000e2", invoiceNumber: "INV-002" })] });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000f1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    const input = screen.getByPlaceholderText("e.g. INV-042");
    await userEvent.clear(input);
    await userEvent.type(input, "INV-002");

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("enables Confirm once the value is edited to a genuinely free number, and saves under it", async () => {
    seed({ invoices: [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000e1", invoiceNumber: "INV-001" })] });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, [invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000f1", invoiceNumber: "INV-001" })]);

    await screen.findByText("Invoice Already Exists");
    await userEvent.click(screen.getByRole("button", { name: "Change Number" }));

    const input = screen.getByPlaceholderText("e.g. INV-042");
    await userEvent.clear(input);
    await userEvent.type(input, "INV-999");

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    const numbers = (await storage.getInvoices()).map((i) => i.invoiceNumber).sort();
    expect(numbers).toEqual(["INV-001", "INV-999"]);
  });
});

describe("ImportExport — conflict detection is scoped per brand", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows no conflict dialog when the collision is only across brands", async () => {
    // The dialog asks the user to choose between two invoices that do not
    // collide. "Overwrite" here would write brand A's invoice over brand B's
    // row — see conflictKey in @/lib/import-pipeline.
    seed({
      invoices: [
        invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000e1", brandId: "brand-b", invoiceNumber: "INV-2026-001" }),
      ],
    });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        brands: [],
        clients: [],
        templates: [],
        invoices: [
          invoice({ id: "aaaaaaa1-0000-4000-8000-0000000000f1", brandId: "brand-a", invoiceNumber: "INV-2026-001" }),
        ],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());
    expect(screen.queryByText("Invoice Already Exists")).not.toBeInTheDocument();

    const stored = await storage.getInvoices();
    expect(stored).toHaveLength(2);
  });
});

describe("ImportExport — full backup envelope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    toast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores brands, clients, templates and invoices from a full backup into an empty app", async () => {
    const b = brand();
    const c = client();
    const t = template();
    const inv = invoice({ brandId: b.id, clientId: c.id });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        exportedAt: "2026-07-28T00:00:00.000Z",
        brands: [b],
        clients: [c],
        templates: [t],
        invoices: [inv],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect((await storage.getBrands()).map((x) => x.id)).toEqual([b.id]);
    expect((await storage.getClients()).map((x) => x.id)).toEqual([c.id]);
    expect((await storage.getTemplates()).map((x) => x.id)).toEqual([t.id]);
    expect((await storage.getInvoices()).map((x) => x.id)).toEqual([inv.id]);
  });

  it("skips brands/clients/templates whose id already exists locally, without overwriting them", async () => {
    seed({
      brands: [brand({ name: "Original Name" })],
      clients: [client({ companyName: "Original Co" })],
      templates: [template({ name: "Original Template" })],
    });

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        brands: [brand({ name: "Imported Name" })],
        clients: [client({ companyName: "Imported Co" })],
        templates: [template({ name: "Imported Template" })],
        invoices: [],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect((await storage.getBrands())).toHaveLength(1);
    expect((await storage.getBrands())[0].name).toBe("Original Name");
    expect((await storage.getClients())[0].companyName).toBe("Original Co");
    expect((await storage.getTemplates())[0].name).toBe("Original Template");

    expect(screen.getByText("Brands skipped (already exist)")).toBeInTheDocument();
    expect(screen.getByText("Clients skipped (already exist)")).toBeInTheDocument();
    expect(screen.getByText("Templates skipped (already exist)")).toBeInTheDocument();
  });

  it("rejects a JSON value that is neither an array nor an object outright", async () => {
    // `"just a string"` is valid JSON (a JSON string literal), so this
    // exercises the *shape* rejection in `validateImportedBackup`, not the
    // `JSON.parse` failure path (covered by the "rename conflict resolution"
    // describe block's malformed-JSON case elsewhere in this file).
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, "just a string", "backup.json");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining("Failed to import — expected an Invoicer backup file")
      )
    );
    expect((await storage.getInvoices())).toHaveLength(0);
  });

  it("reports a malformed collection honestly and still imports what's readable", async () => {
    const b = brand();

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      {
        version: 2,
        brands: [b],
        clients: "not a list",
        templates: [{ junk: true }, null],
        invoices: [],
      },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect((await storage.getBrands()).map((x) => x.id)).toEqual([b.id]);
    expect((await storage.getClients())).toHaveLength(0);
    // Neither junk template record was imported.
    //
    // This used to assert the three default templates instead. That was
    // `forceMigration` seeding them into localStorage when the collection
    // came back empty — a side effect of the v1→v2 migration, which no
    // longer reaches templates now they live in Postgres. Nothing seeds
    // defaults for a new account yet; recorded as carry-over, and not
    // user-visible while FEATURES.followups is off.
    expect(await storage.getTemplates()).toHaveLength(0);
    expect(screen.getByText("Clients section unreadable")).toBeInTheDocument();
    expect(screen.getByText("Templates skipped (invalid)")).toBeInTheDocument();
  });
});

/**
 * The pre-launch legal gate asks for a tested restore, and this is it: a file
 * in the shape the app produced before any of its data lived in Postgres.
 *
 * The trap it exists to catch is the seeded template ids. `tpl-gentle-nudge`
 * is not a uuid, so Postgres rejects it outright — and every brand pointing
 * at one carries the same broken reference. Nothing about that is visible
 * until someone with two years of invoices tries to restore them.
 */
describe("ImportExport — restoring a backup written before hosted storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    toast.mockClear();
  });

  // Ids exactly as the old app wrote them: crypto.randomUUID() for records
  // the user created, hand-written constants for the seeded templates.
  const LEGACY_BACKUP = {
    version: 2,
    exportedAt: "2026-07-01T00:00:00.000Z",
    brands: [
      brand({
        id: "9f1c7b52-3d44-4a19-9f0e-2b7c1e5a8d33",
        name: "Sivan Studio",
        followup: {
          enabled: true,
          mode: "weekly" as const,
          weekday: 2,
          time: "09:00",
          repeat: "week" as const,
          templateId: "tpl-gentle-nudge",
          stopAfter: 4,
        },
      }),
    ],
    clients: [
      client({ id: "4c2e8a71-6b90-4f21-8c3d-7a1e9b4f2c60", companyName: "Harbourline Foods" }),
    ],
    templates: [
      { ...template({ id: "tpl-gentle-nudge", name: "Gentle nudge" }) },
      { ...template({ id: "tpl-second-reminder", name: "Second reminder", tone: "Direct" as const }) },
      { ...template({ id: "tpl-final-notice", name: "Final notice", tone: "Firm" as const }) },
    ],
    invoices: [
      invoice({
        id: "d81b3f45-27ac-4e6d-9b52-8c04a7e1f39b",
        invoiceNumber: "SC-2025-014",
        brandId: "9f1c7b52-3d44-4a19-9f0e-2b7c1e5a8d33",
        clientId: "4c2e8a71-6b90-4f21-8c3d-7a1e9b4f2c60",
      }),
    ],
  };

  it("restores every record, rewriting only the ids Postgres would reject", async () => {
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, LEGACY_BACKUP, "invoicer-backup.json");

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    const brands = await storage.getBrands();
    const clients = await storage.getClients();
    const templates = await storage.getTemplates();
    const invoices = await storage.getInvoices();

    expect(brands.map((b) => b.name)).toEqual(["Sivan Studio"]);
    expect(clients.map((c) => c.companyName)).toEqual(["Harbourline Foods"]);
    expect(templates.map((t) => t.name).sort()).toEqual([
      "Final notice",
      "Gentle nudge",
      "Second reminder",
    ]);
    expect(invoices).toHaveLength(1);

    // The ids the old app generated are already uuids and must survive
    // untouched — rewriting them would be churn, and would break the
    // conflict detection that keeps a second import from duplicating them.
    expect(brands[0].id).toBe("9f1c7b52-3d44-4a19-9f0e-2b7c1e5a8d33");
    expect(clients[0].id).toBe("4c2e8a71-6b90-4f21-8c3d-7a1e9b4f2c60");

    // The seeded template ids are not uuids, so they are replaced...
    expect(templates.every((t) => t.id.startsWith("tpl-"))).toBe(false);
    // ...and the brand that pointed at one follows to the new id rather than
    // being left with a reference to a template that was never stored.
    const gentleNudge = templates.find((t) => t.name === "Gentle nudge")!;
    expect(brands[0].followup.templateId).toBe(gentleNudge.id);
  });

  it("keeps the invoice pointed at the brand and client it was billed under", async () => {
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, LEGACY_BACKUP, "invoicer-backup.json");

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    const [invoice] = await storage.getInvoices();
    const [brand] = await storage.getBrands();
    const [client] = await storage.getClients();

    expect(invoice.brandId).toBe(brand.id);
    expect(invoice.clientId).toBe(client.id);
    // The number a client already has in their inbox is never reallocated.
    expect(invoice.invoiceNumber).toBe("SC-2025-014");
  });

  it("backfills the fields validation does not require, instead of dropping the record", async () => {
    // `currency`, `brandSnapshot`, `reminders` and `followupsPaused` are all
    // absent from a genuinely old invoice. Validation lets them through on
    // purpose; migrateToV2 fills them in. Without that step `currency` is
    // null, which violates a NOT NULL constraint, and the invoice is
    // silently counted as failed rather than restored.
    const bare = {
      id: "e2f4a018-5c33-4b7e-9a61-0d8b2c6f4711",
      invoiceNumber: "SC-2019-003",
      brandId: "9f1c7b52-3d44-4a19-9f0e-2b7c1e5a8d33",
      billDate: "2019-04-01",
      dueDate: "2019-04-15",
      client: { companyName: "Harbourline Foods", address: "9 Dock Street" },
      items: [{ id: "l1", description: "Retainer", amount: 50000, tax: 18 }],
      subtotal: 50000,
      totalTax: 9000,
      total: 59000,
      status: "paid",
      createdAt: "2019-04-01T00:00:00.000Z",
      updatedAt: "2019-04-01T00:00:00.000Z",
    };

    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(
      container,
      { ...LEGACY_BACKUP, invoices: [bare] },
      "invoicer-backup.json"
    );

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    const [restored] = await storage.getInvoices();
    expect(restored).toBeDefined();
    expect(restored.invoiceNumber).toBe("SC-2019-003");
    expect(restored.currency).toBe("INR");
    expect(restored.reminders).toEqual([]);
    expect(restored.followupsPaused).toBe(false);
    expect(restored.brandSnapshot.invoicePrefix).toBeTruthy();
  });

  it("does not invent default templates for a file that had none", async () => {
    // migrateToV2 seeds three when handed an empty template list — correct
    // for a first-run migration, wrong for an import.
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, { ...LEGACY_BACKUP, templates: [] }, "invoicer-backup.json");

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    expect(await storage.getTemplates()).toHaveLength(0);
  });

  it("tells the user their ids were rewritten, and what that means", async () => {
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, LEGACY_BACKUP, "invoicer-backup.json");

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    // Three template ids were rewritten. Re-importing this same file would
    // add a second copy of them rather than skipping, and the user has no
    // way to know that unless told.
    // Matched against the paragraph's whole text: React splits the
    // interpolated count into its own node, so a plain string match on the
    // sentence finds nothing.
    const notice = screen
      .getAllByText((_content, element) =>
        (element?.textContent ?? "").includes("had their ids rewritten")
      )
      .pop();

    expect(notice?.textContent).toMatch(/3 records had their ids rewritten/);
    expect(notice?.textContent).toMatch(/add a second copy rather than skipping them/);
  });
});

/**
 * Export → import, in one pass.
 *
 * The format is what a user's only copy of their data is written in, so a
 * change to it that nobody notices is a change that silently strands old
 * files. Asserting the object rather than the downloaded Blob keeps the
 * check on the format itself.
 */
describe("ImportExport — export format", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    toast.mockClear();
  });

  it("writes the same envelope shape the pre-Postgres app did", async () => {
    seed({
      brands: [brand()],
      clients: [client()],
      templates: [template()],
      invoices: [invoice()],
    });

    const backup = await buildBackup();

    expect(Object.keys(backup).sort()).toEqual([
      "brands",
      "clients",
      "exportedAt",
      "invoices",
      "templates",
      "version",
    ]);
    expect(backup.version).toBe(2);
    expect(backup.brands).toHaveLength(1);
    expect(backup.invoices[0].items).toHaveLength(1);
  });

  it("round-trips: what it exports, it can import back unchanged", async () => {
    seed({
      brands: [brand()],
      clients: [client()],
      templates: [template()],
      invoices: [invoice()],
    });

    const exported = await buildBackup();

    // Restore into an empty account, the way a real recovery would.
    resetFakeSeam();
    const { container } = renderWithProviders(<ImportExport onImportDone={() => {}} />);
    uploadFile(container, exported, "invoicer-backup.json");

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());

    // Ids survive, because everything this build writes is already a uuid —
    // which is also what lets a second import skip rather than duplicate.
    expect((await storage.getBrands()).map((b) => b.id)).toEqual(exported.brands.map((b) => b.id));
    expect((await storage.getClients()).map((c) => c.id)).toEqual(
      exported.clients.map((c) => c.id)
    );
    expect((await storage.getInvoices()).map((i) => i.invoiceNumber)).toEqual(
      exported.invoices.map((i) => i.invoiceNumber)
    );
    expect(screen.queryByText(/had their ids rewritten/)).not.toBeInTheDocument();
  });
});
