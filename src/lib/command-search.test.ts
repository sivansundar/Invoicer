import { describe, expect, it } from "vitest";
import {
  buildCommandGroups,
  capNote,
  commandActions,
  flattenGroups,
  recentInvoices,
  resultSummary,
  scoreMatch,
  searchActions,
  searchBrands,
  searchClients,
  searchInvoices,
} from "./command-search";
import type { Brand, Client, Invoice } from "./types";

const FLAGS_ON = { billing: true, followups: true };
const FLAGS_OFF = { billing: false, followups: false };

// Fixed so `effectiveStatus` cannot drift a "sent" invoice into "overdue"
// between runs.
const TODAY = new Date("2026-07-15T00:00:00Z");

function invoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    invoiceNumber: "INV-001",
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-07-01",
    dueDate: "2026-07-31",
    client: { companyName: "Avara Labs", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 12000,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "",
    brandSnapshot: {
      name: "Brand One",
      address: "",
      invoicePrefix: "BR",
      accentColor: "#4f46e5",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

function client(overrides: Partial<Client> & { id: string }): Client {
  return {
    companyName: "Avara Labs",
    address: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function brand(overrides: Partial<Brand> & { id: string }): Brand {
  return {
    name: "Studio Cadence",
    address: "",
    email: "hi@example.com",
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    invoicePrefix: "SC",
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#4f46e5",
    followup: {
      enabled: true,
      mode: "weekly",
      weekday: 1,
      time: "09:00",
      repeat: "week",
      templateId: "t1",
      stopAfter: 0,
    },
    invoiceDesign: "modern",
    ...overrides,
  };
}

describe("scoreMatch", () => {
  it("ranks exact above prefix above word-start above substring", () => {
    const exact = scoreMatch("Avara Labs", "avara labs")!;
    const prefix = scoreMatch("Avara Labs", "ava")!;
    const word = scoreMatch("Avara Labs", "lab")!;
    const substring = scoreMatch("Avara Labs", "vara")!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(substring);
  });

  it("treats the separator in an invoice number as a word boundary", () => {
    expect(scoreMatch("INV-014", "014")).toBe(scoreMatch("Avara Labs", "labs"));
  });

  it("is case- and whitespace-insensitive", () => {
    expect(scoreMatch("  Avara Labs ", "AVARA")).toBe(scoreMatch("Avara Labs", "avara"));
  });

  it("returns null for a miss and for an empty query", () => {
    expect(scoreMatch("Avara Labs", "zeta")).toBeNull();
    expect(scoreMatch("Avara Labs", "   ")).toBeNull();
  });
});

describe("searchActions", () => {
  it("omits a flagged destination when its flag is off", () => {
    expect(commandActions(FLAGS_OFF).map((i) => i.label)).not.toContain("Follow-ups");
    expect(commandActions(FLAGS_ON).map((i) => i.label)).toContain("Follow-ups");
    expect(searchActions(FLAGS_OFF, "follow")).toEqual([]);
  });

  it("matches on the label rather than returning everything", () => {
    expect(searchActions(FLAGS_ON, "new").map((i) => i.label)).toEqual([
      "New invoice",
      "New client",
      "New brand",
    ]);
    expect(searchActions(FLAGS_ON, "avara")).toEqual([]);
  });

  it("points each action at a real route", () => {
    expect(commandActions(FLAGS_ON).map((i) => i.href)).toEqual([
      "/invoices/create",
      "/clients/create",
      "/brands/create",
      "/dashboard",
      "/reports",
      "/followups",
    ]);
  });
});

describe("searchInvoices", () => {
  const invoices = [
    invoice({ id: "1", invoiceNumber: "INV-014", client: { companyName: "Northwind", address: "" } }),
    invoice({ id: "2", invoiceNumber: "SC-002", client: { companyName: "INV Holdings", address: "" } }),
  ];

  it("matches on invoice number and on client name", () => {
    expect(searchInvoices(invoices, "northwind", TODAY).map((i) => i.id)).toEqual(["invoice:1"]);
    expect(searchInvoices(invoices, "sc-002", TODAY).map((i) => i.id)).toEqual(["invoice:2"]);
  });

  it("ranks a number match above a client match in the same band", () => {
    expect(searchInvoices(invoices, "inv", TODAY).map((i) => i.id)).toEqual([
      "invoice:1",
      "invoice:2",
    ]);
  });

  it("formats the amount in the invoice's own currency and never sums across them", () => {
    const mixed = [
      invoice({ id: "u", invoiceNumber: "US-001", currency: "USD", total: 1200 }),
      invoice({ id: "i", invoiceNumber: "US-002", currency: "INR", total: 1200 }),
    ];
    const amounts = searchInvoices(mixed, "us-", TODAY).map((i) => i.amount);
    expect(amounts).toHaveLength(2);
    expect(amounts[0]).toContain("$");
    expect(amounts[1]).toContain("₹");
  });

  it("reports the status the rest of the app shows, not the stored one", () => {
    const late = invoice({ id: "l", status: "sent", dueDate: "2026-07-01" });
    expect(searchInvoices([late], "inv", TODAY)[0].status).toBe("overdue");
  });

  it("breaks score ties by newest first", () => {
    const older = invoice({ id: "old", invoiceNumber: "AC-001", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = invoice({ id: "new", invoiceNumber: "AC-002", createdAt: "2026-06-01T00:00:00.000Z" });
    expect(searchInvoices([older, newer], "ac-", TODAY).map((i) => i.id)).toEqual([
      "invoice:new",
      "invoice:old",
    ]);
  });
});

describe("searchClients and searchBrands", () => {
  it("matches a client on its company name or its contact name", () => {
    const clients = [client({ id: "c1", companyName: "Northwind", name: "Ada Vance" })];
    expect(searchClients(clients, "north").map((i) => i.id)).toEqual(["client:c1"]);
    expect(searchClients(clients, "ada").map((i) => i.id)).toEqual(["client:c1"]);
    expect(searchClients(clients, "zeta")).toEqual([]);
  });

  it("sends a client to its edit route and a brand to its own", () => {
    expect(searchClients([client({ id: "c1" })], "avara")[0].href).toBe("/clients/c1/edit");
    expect(searchBrands([brand({ id: "b1" })], "studio")[0].href).toBe("/brands/b1/edit");
  });
});

describe("buildCommandGroups", () => {
  const invoices = Array.from({ length: 8 }, (_, i) =>
    invoice({
      id: `i${i}`,
      invoiceNumber: `AC-00${i}`,
      createdAt: `2026-0${i + 1}-01T00:00:00.000Z`,
    })
  );

  it("shows actions and recent invoices when nothing has been typed", () => {
    const groups = buildCommandGroups({
      query: "",
      invoices,
      clients: [client({ id: "c1" })],
      brands: [brand({ id: "b1" })],
      features: FLAGS_ON,
      today: TODAY,
    });
    expect(groups.map((g) => g.key)).toEqual(["actions", "invoices"]);
    expect(groups[1].label).toBe("Recent invoices");
    expect(groups[1].items[0].label).toBe("AC-007");
  });

  it("caps each group and says how many were held back", () => {
    const groups = buildCommandGroups({
      query: "AC-",
      invoices,
      clients: [],
      brands: [],
      features: FLAGS_ON,
      today: TODAY,
    });
    const found = groups.find((g) => g.key === "invoices")!;
    expect(found.items).toHaveLength(5);
    expect(found.matched).toBe(8);
    expect(capNote(found)).toBe("Showing 5 of 8 — type to narrow the list");
  });

  it("says nothing about a cap when the whole group fits", () => {
    const groups = buildCommandGroups({
      query: "AC-001",
      invoices,
      clients: [],
      brands: [],
      features: FLAGS_ON,
      today: TODAY,
    });
    expect(capNote(groups[0])).toBeNull();
  });

  it("returns no groups at all when nothing matches", () => {
    const groups = buildCommandGroups({
      query: "nothing here",
      invoices,
      clients: [client({ id: "c1" })],
      brands: [brand({ id: "b1" })],
      features: FLAGS_ON,
      today: TODAY,
    });
    expect(groups).toEqual([]);
    expect(flattenGroups(groups)).toEqual([]);
  });

  it("keeps a flagged-off destination out of the no-query list too", () => {
    const groups = buildCommandGroups({
      query: "",
      invoices: [],
      clients: [],
      brands: [],
      features: FLAGS_OFF,
      today: TODAY,
    });
    expect(flattenGroups(groups).map((i) => i.href)).not.toContain("/followups");
  });

  it("flattens groups in render order", () => {
    const groups = buildCommandGroups({
      query: "avara",
      invoices: [invoice({ id: "i1" })],
      clients: [client({ id: "c1" })],
      brands: [],
      features: FLAGS_ON,
      today: TODAY,
    });
    expect(flattenGroups(groups).map((i) => i.id)).toEqual(["invoice:i1", "client:c1"]);
  });

  it("does not mutate the invoices it was handed", () => {
    const input = [...invoices];
    recentInvoices(input, TODAY);
    expect(input.map((i) => i.id)).toEqual(invoices.map((i) => i.id));
  });
});

describe("resultSummary", () => {
  const invoices = Array.from({ length: 8 }, (_, i) =>
    invoice({
      id: `i${i}`,
      invoiceNumber: `AC-00${i}`,
      createdAt: `2026-0${i + 1}-01T00:00:00.000Z`,
    })
  );

  function summaryFor(query: string): string {
    return resultSummary(
      buildCommandGroups({
        query,
        invoices,
        clients: [client({ id: "c1", companyName: "Northwind" })],
        brands: [],
        features: FLAGS_ON,
        today: TODAY,
      })
    );
  }

  it("names the total whenever a cap is holding rows back", () => {
    expect(summaryFor("AC-")).toBe("5 of 8 results");
  });

  it("counts only what is shown when nothing was held back", () => {
    expect(summaryFor("northwind")).toBe("1 result");
    expect(summaryFor("AC-001")).toBe("1 result");
  });

  it("counts the actions in the no-query list, which are never capped", () => {
    // Six actions with both flags on, plus the five most recent of eight
    // invoices.
    expect(summaryFor("")).toBe("11 of 14 results");
  });

  it("reports nothing rather than a stray zero-of-something", () => {
    expect(resultSummary([])).toBe("0 results");
  });
});
