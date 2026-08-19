import { describe, expect, it } from "vitest";
import * as fake from "./fake-seam";
import * as real from "@/lib/storage";

/**
 * The fake is only useful while it matches the module it replaces.
 *
 * Without this, adding an export to `storage.ts` leaves every test that mocks
 * it calling `undefined`, and removing one leaves the fake quietly
 * implementing a function nothing has any more — both failures show up as
 * confusing errors far from the cause, or not at all.
 */

// Helpers the fake adds for tests to drive it. Not part of the seam.
const TEST_ONLY = new Set(["resetFakeSeam", "seed", "failNext", "failOnCall"]);

function exportsOf(mod: object): string[] {
  return Object.keys(mod)
    .filter((name) => !TEST_ONLY.has(name))
    .sort();
}

describe("the fake seam matches @/lib/storage", () => {
  it("exports exactly the same names", () => {
    expect(exportsOf(fake)).toEqual(exportsOf(real));
  });

  it("re-exports the SAME LogoUploadError class, not a lookalike", () => {
    // The name-parity and typeof checks below both pass for a fake that
    // declares its own `class LogoUploadError extends Error {}` — a class
    // and an arrow function both report typeof "function". A locally
    // redefined class would silently defeat every `instanceof
    // LogoUploadError` check in callers like `brand-form.tsx`, which is the
    // entire reason `storage-errors.ts` exists as its own module. Identity,
    // not shape, is the guarantee that matters here.
    expect(fake.LogoUploadError).toBe(real.LogoUploadError);
  });

  it("exports a function wherever the real module does", () => {
    for (const name of exportsOf(real)) {
      const realExport = (real as Record<string, unknown>)[name];
      const fakeExport = (fake as Record<string, unknown>)[name];

      expect(typeof fakeExport, `${name} should be a ${typeof realExport}`).toBe(
        typeof realExport
      );
    }
  });

  it("returns a promise wherever the real seam does", async () => {
    // A fake that answers synchronously where the real seam returns a promise
    // makes tests pass on code that would race in production. Probed by
    // calling rather than by constructor name: vi.fn wraps an async function
    // in a plain one, so the name says "Function" either way.
    const cases: Array<[string, unknown[]]> = [
      ["getBrands", []],
      ["getBrand", ["id"]],
      ["saveBrand", [{ id: "b1" }]],
      ["deleteBrand", ["b1"]],
      ["getClients", []],
      ["saveClient", [{ id: "c1" }]],
      ["deleteClient", ["c1"]],
      ["getTemplates", []],
      ["saveTemplate", [{ id: "t1" }]],
      ["deleteTemplate", ["t1"]],
      ["getInvoices", []],
      ["getInvoice", ["i1"]],
      ["deleteInvoice", ["i1"]],
    ];

    for (const [name, args] of cases) {
      const fakeFn = (fake as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const result = fakeFn(...args);

      expect(result, `fake ${name} should return a promise`).toBeInstanceOf(Promise);
      await result;
    }
  });

  /**
   * The synchronous-plan-state check that used to live here is gone with the
   * behaviour it guarded: plan state moved to `org_billing` and `getPlan` is
   * an ordinary async PostgREST read like every other record, so there is no
   * longer a boolean-vs-promise mismatch for a fake to get wrong.
   */
  it("mirrors the server allocating an invoice number on create", async () => {
    // The fake must not simply echo the number it was handed. The real
    // create_invoice allocates, so a test asserting "the UI reports the
    // server's number" would pass against an echoing fake even if the UI
    // still displayed its own provisional one.
    fake.resetFakeSeam();

    const draft = {
      id: "i1",
      brandId: "b1",
      invoiceNumber: "SC-2026-001",
      billDate: "2026-06-01",
      brandSnapshot: { invoicePrefix: "SC" },
      items: [],
    } as unknown as Parameters<typeof fake.createInvoice>[0];

    const first = await fake.createInvoice(draft);
    expect(first.invoiceNumber).toBe("SC-2026-001");

    // A second create with the same provisional number gets the next one,
    // exactly as it would if another tab had saved first.
    const second = await fake.createInvoice({ ...draft, id: "i2" });
    expect(second.invoiceNumber).toBe("SC-2026-002");
  });

  it("preserves a supplied number when restoring, rather than allocating", async () => {
    fake.resetFakeSeam();

    const restored = {
      id: "i9",
      brandId: "b1",
      invoiceNumber: "SC-2019-042",
      billDate: "2019-06-01",
      brandSnapshot: { invoicePrefix: "SC" },
      items: [],
    } as unknown as Parameters<typeof fake.createInvoice>[0];

    const saved = await fake.createInvoice(restored, { preserveNumber: true });

    expect(saved.invoiceNumber).toBe("SC-2019-042");
    expect(saved.id).toBe("i9");
  });
});
