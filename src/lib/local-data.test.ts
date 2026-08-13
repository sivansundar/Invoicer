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
    });
    expect(localInvoiceCount()).toBe(2);
  });

  it("returns null when every key is present but empty", () => {
    for (const key of ["brands", "clients", "templates", "invoices"]) {
      localStorage.setItem(`invoicer_${key}`, "[]");
    }
    expect(readLocalCollections()).toBeNull();
  });

  it("survives corrupt JSON rather than throwing on mount", () => {
    localStorage.setItem("invoicer_brands", "{not json");
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));

    expect(readLocalCollections()).toEqual({
      brands: [],
      clients: [],
      templates: [],
      invoices: [{ id: "i1" }],
    });
  });

  it("ignores a key holding a non-array", () => {
    localStorage.setItem("invoicer_brands", JSON.stringify({ id: "b1" }));
    expect(readLocalCollections()).toBeNull();
  });

  it("remembers dismissal without touching the data keys", () => {
    localStorage.setItem("invoicer_invoices", JSON.stringify([{ id: "i1" }]));
    expect(isImportPromptDismissed()).toBe(false);

    dismissImportPrompt();

    expect(isImportPromptDismissed()).toBe(true);
    expect(localStorage.getItem("invoicer_invoices")).toBe(JSON.stringify([{ id: "i1" }]));
  });
});
