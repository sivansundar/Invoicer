import { describe, expect, it } from "vitest";
import {
  brandToRow,
  clientToRow,
  rowToBrand,
  rowToClient,
  rowToTemplate,
  templateToRow,
  type BrandRow,
} from "./mappers";
import type { Brand, Client, EmailTemplate } from "@/lib/types";

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sivan Studio",
    address: "44, 100 Feet Rd",
    email: "billing@sivan.studio",
    phone: "+91 99999 99999",
    gstNumber: "29ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    logo: "data:image/png;base64,iVBORw0KGgo=",
    bankDetails: {
      accountName: "Sivan Studio",
      accountNumber: "000111222",
      bankName: "HDFC",
      ifscCode: "HDFC0000123",
    },
    invoicePrefix: "SC",
    nextInvoiceNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: false,
      mode: "weekly",
      weekday: 1,
      time: "09:00",
      repeat: "week",
      templateId: "",
      stopAfter: 0,
    },
    invoiceDesign: "modern",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    companyName: "Acme Studio",
    name: "Priya Nair",
    address: "12 Residency Rd",
    email: "priya@acme.test",
    phone: "+91 88888 88888",
    gstNumber: "29ZZZZZ1234F1Z5",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Gentle nudge",
    subject: "Invoice {{number}}",
    tone: "Friendly",
    body: "Hi {{client}}, just a nudge.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("brand mapping", () => {
  it("round-trips a fully populated brand", () => {
    const original = brand();
    expect(rowToBrand(brandToRow(original) as BrandRow)).toEqual(original);
  });

  it("round-trips a brand with every optional field absent", () => {
    const original = brand({
      phone: undefined,
      gstNumber: undefined,
      panNumber: undefined,
      logo: undefined,
    });
    expect(rowToBrand(brandToRow(original) as BrandRow)).toEqual(original);
  });

  it("writes absent optionals as null, not as a missing key", () => {
    // PostgREST treats an absent key as "leave the column alone" on update,
    // so clearing a field has to send an explicit null. Dropping the key
    // instead would make removing a GST number silently do nothing.
    const row = brandToRow(brand({ phone: undefined, gstNumber: undefined }));

    expect(row.phone).toBeNull();
    expect(row.gst_number).toBeNull();
    expect("phone" in row).toBe(true);
    expect("gst_number" in row).toBe(true);
  });

  it("carries the base64 logo through logo_data", () => {
    const row = brandToRow(brand({ logo: "data:image/png;base64,AAAA" }));

    expect(row.logo_data).toBe("data:image/png;base64,AAAA");
  });

  it("carries logo_path in both directions", () => {
    const row = brandToRow(brand({ logoPath: "b/abc.png" }));
    expect(row.logo_path).toBe("b/abc.png");
    expect(rowToBrand({ ...(row as BrandRow), logo_path: "b/abc.png" }).logoPath).toBe(
      "b/abc.png"
    );
  });

  it("nulls logo_path when the brand has none, so the column can be cleared", () => {
    expect(brandToRow(brand({ logoPath: undefined })).logo_path).toBeNull();
  });

  it("never writes org_id — the column default owns tenancy", () => {
    expect("org_id" in brandToRow(brand())).toBe(false);
  });

  it("drops the dead nextInvoiceNumber field rather than persisting it", () => {
    expect("next_invoice_number" in brandToRow(brand({ nextInvoiceNumber: 47 }))).toBe(false);
  });

  it("reads a null email as an empty string, since Brand.email is required", () => {
    const row = brandToRow(brand()) as BrandRow;
    expect(rowToBrand({ ...row, email: null }).email).toBe("");
  });

  it("normalises the timestamp Postgres returns", () => {
    const row = brandToRow(brand()) as BrandRow;
    // timestamptz comes back with an offset and microseconds, not as the
    // ISO-with-Z string the domain type uses everywhere else.
    const read = rowToBrand({ ...row, created_at: "2026-01-01 05:30:00.123456+05:30" });

    expect(read.createdAt).toBe("2026-01-01T00:00:00.123Z");
  });
});

describe("client mapping", () => {
  it("round-trips a fully populated client", () => {
    const original = client();
    expect(rowToClient(clientToRow(original))).toEqual(original);
  });

  it("round-trips a client with every optional field absent", () => {
    const original = client({
      name: undefined,
      email: undefined,
      phone: undefined,
      gstNumber: undefined,
    });
    expect(rowToClient(clientToRow(original))).toEqual(original);
  });

  it("never writes org_id", () => {
    expect("org_id" in clientToRow(client())).toBe(false);
  });
});

describe("template mapping", () => {
  it("round-trips a template", () => {
    const original = template();
    expect(rowToTemplate(templateToRow(original))).toEqual(original);
  });

  it("never writes org_id", () => {
    expect("org_id" in templateToRow(template())).toBe(false);
  });
});
