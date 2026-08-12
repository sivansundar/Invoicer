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
    ];

    for (const [name, args] of cases) {
      const fakeFn = (fake as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const result = fakeFn(...args);

      expect(result, `fake ${name} should return a promise`).toBeInstanceOf(Promise);
      await result;
    }
  });

  it("keeps invoices and plan state synchronous, matching the real seam", () => {
    // These have not moved to Postgres. If one of them starts returning a
    // promise here but not there (or vice versa), callers that branch on a
    // boolean silently take the wrong path — `if (!save(x))` on a promise is
    // never true.
    fake.resetFakeSeam();

    expect(fake.getInvoices()).toBeInstanceOf(Array);
    expect(typeof fake.saveInvoice({ id: "i1" } as never)).toBe("boolean");
    expect(typeof fake.deleteInvoice("i1")).toBe("boolean");
    expect(typeof fake.savePlan({ tier: "free", renewsOn: null })).toBe("boolean");
  });
});
