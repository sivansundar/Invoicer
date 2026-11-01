import { describe, expect, it } from "vitest";
import { toZohoCsv } from "./zoho-export";
import type { Invoice } from "./types";

const base = {
  id: "1",
  invoiceNumber: "PL-2026-001",
  brandId: "b",
  status: "sent",
  billDate: "2026-11-01",
  dueDate: "2026-12-01",
  subtotal: 1500,
  totalTax: 0,
  total: 1500,
  createdAt: "",
  updatedAt: "",
  clientId: null,
  reminders: [],
  followupsPaused: false,
  brandSnapshot: { gstNumber: "29FUVPS0879F1ZL" },
} as unknown as Invoice;

function parse(csv: string) {
  const [header, ...rows] = csv.trim().split("\n");
  const cols = header.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
}

describe("toZohoCsv", () => {
  it("exports a foreign-currency invoice as a zero-rated overseas supply", () => {
    const [row] = parse(
      toZohoCsv([
        {
          ...base,
          currency: "USD",
          client: { companyName: "Studio Kappal Pte. Ltd.", address: "Singapore", uen: "201912345K" },
          items: [{ id: "i", description: "Development Services", amount: 1500, tax: 0 }],
        },
      ])
    );
    expect(row["Customer Name"]).toBe("Studio Kappal Pte. Ltd.");
    expect(row["GST Treatment"]).toBe("overseas");
    expect(row["Place of Supply"]).toBe("");
    expect(row["Currency Code"]).toBe("USD");
    expect(row["Item Tax"]).toBe("IGST0");
    expect(row["Payment Terms Label"]).toBe("Net 30");
    expect(row["Due Date"]).toBe("2026-12-01");
    expect(row["Invoice Status"]).toBe("Sent");
  });

  it("uses a GST tax group in-state and IGST across states, one row per item", () => {
    const rows = parse(
      toZohoCsv([
        {
          ...base,
          currency: "INR",
          client: { companyName: "Local Co", address: "Bengaluru", gstNumber: "29AAAAA0000A1Z5" },
          items: [{ id: "i", description: "Design", amount: 1000, tax: 18 }],
        },
        {
          ...base,
          invoiceNumber: "PL-2026-002",
          currency: "INR",
          client: { companyName: "Chennai Co", address: "Chennai", gstNumber: "33AAAAA0000A1Z5" },
          items: [
            { id: "a", description: "Build", amount: 2000, tax: 18 },
            { id: "b", description: "Hosting", amount: 500, tax: 18 },
          ],
        },
      ])
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ "Place of Supply": "KA", "Item Tax": "GST18", "Item Tax Type": "Tax Group", "GST Treatment": "business_gst" });
    expect(rows[1]).toMatchObject({ "Place of Supply": "TN", "Item Tax": "IGST18", "Item Tax Type": "ItemAmount" });
    expect(rows[2]["Invoice Number"]).toBe("PL-2026-002");
  });

  it("quotes cells containing commas", () => {
    const csv = toZohoCsv([
      { ...base, currency: "SGD", client: { companyName: "A, B Pte", address: "" }, items: [{ id: "i", description: "X", amount: 1, tax: 0 }] },
    ]);
    expect(csv).toContain('"A, B Pte"');
  });
});
