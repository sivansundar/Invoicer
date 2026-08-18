import { describe, it, expect, beforeEach } from "vitest";
import {
  readLocalCollections,
  localInvoiceCount,
  isImportPromptDismissed,
  dismissImportPrompt,
} from "./local-data";

describe("local-data", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when the device has nothing", () => {
    expect(readLocalCollections()).toBeNull();
    expect(localInvoiceCount()).toBe(0);
  });

  it("assembles the invoicer_* keys into one payload", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([{ id: "b1" }]));
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }, { id: "i2" }]));

    expect(readLocalCollections()).toEqual({
      brands: [{ id: "b1" }],
      clients: [],
      templates: [],
      invoices: [{ id: "i1" }, { id: "i2" }],
      corruptKeys: [],
    });
    expect(localInvoiceCount()).toBe(2);
  });

  it("returns null when every key is present but empty", () => {
    for (const key of ["brands", "clients", "templates", "invoices"]) {
      localStorage.setItem(`invoicer_${key}`, "[]");
    }
    expect(readLocalCollections()).toBeNull();
  });

  it("survives corrupt JSON rather than throwing on mount, and reports which key was unreadable", () => {
    localStorage.setItem("invoicer_brands", "{not json");
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));

    expect(readLocalCollections()).toEqual({
      brands: [],
      clients: [],
      templates: [],
      invoices: [{ id: "i1" }],
      corruptKeys: ["brands"],
    });
  });

  // A key holding a non-array is unreadable, not empty — distinct from a
  // key that legitimately holds "[]" (see "returns null when every key is
  // present but empty" above). Conflating the two is exactly what let
  // "Clear local copy" delete a corrupt key nothing else ever recovered.
  it("reports a key holding a non-array as corrupt rather than treating it as empty", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify({ id: "b1" }));
    expect(readLocalCollections()).toEqual({
      brands: [],
      clients: [],
      templates: [],
      invoices: [],
      corruptKeys: ["brands"],
    });
  });

  // The corrupt-key variant of the "Clear local copy" bug: a truncated
  // `invoicer_invoices` write parses to nothing, but the raw bytes are
  // still there and still unrecoverable if the key is deleted. `total`
  // alone (0) would say "nothing to report" — `corruptKeys` is what stops
  // that from collapsing into the absent-or-empty case.
  it("still reports a corrupt key even when every other collection is legitimately empty", () => {
    localStorage.setItem("invoicer_invoices", "[{ truncated");
    const result = readLocalCollections();
    expect(result).not.toBeNull();
    expect(result!.corruptKeys).toEqual(["invoices"]);
    expect(result!.invoices).toEqual([]);
  });

  it("remembers dismissal without touching the data keys", () => {
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));
    expect(isImportPromptDismissed()).toBe(false);

    dismissImportPrompt();

    expect(isImportPromptDismissed()).toBe(true);
    expect(localStorage.getItem("invoicer_invoices")).toBe(JSON.stringify([{ id: "i1" }]));
  });
});
