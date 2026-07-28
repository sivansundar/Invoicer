import { describe, expect, it } from "vitest";
import { getCrumb, showNewInvoiceAction } from "./site-header";

// Every row of the design handoff's breadcrumb table (task-10-brief.md).
const CRUMB_CASES: Array<[path: string, crumb: string]> = [
  ["/", "Dashboard"],
  ["/invoices/create", "New invoice"],
  ["/invoices/abc123", "Invoice"],
  ["/invoices/abc123/edit", "Edit invoice"],
  ["/brands", "Brands"],
  ["/brands/create", "Brand details"],
  ["/brands/abc123/edit", "Brand details"],
  ["/clients", "Clients"],
  ["/clients/create", "New client"],
  ["/clients/abc123/edit", "New client"],
  ["/followups", "Follow-ups"],
  ["/followups/templates/overdue", "Email template"],
  ["/reports", "Reports"],
];

describe("getCrumb", () => {
  describe.each(CRUMB_CASES)("for %s", (path, expected) => {
    it(`returns "${expected}"`, () => {
      expect(getCrumb(path)).toBe(expected);
    });
  });

  it("falls back to the app name for an unmapped route", () => {
    expect(getCrumb("/some-future-route")).toBe("Invoicer");
    expect(getCrumb("/followups/templates")).toBe("Invoicer");
  });

  it("does not let the detail route swallow the create route", () => {
    expect(getCrumb("/invoices/create")).toBe("New invoice");
    expect(getCrumb("/invoices/create")).not.toBe("Invoice");
  });

  it("does not let the detail route swallow the edit route", () => {
    expect(getCrumb("/invoices/abc123/edit")).toBe("Edit invoice");
    expect(getCrumb("/invoices/abc123/edit")).not.toBe("Invoice");
  });
});

describe("showNewInvoiceAction", () => {
  it("shows the action on the dashboard", () => {
    expect(showNewInvoiceAction("/")).toBe(true);
  });

  it("shows the action on an invoice detail route", () => {
    expect(showNewInvoiceAction("/invoices/abc123")).toBe(true);
  });

  it("hides the action on the create route", () => {
    expect(showNewInvoiceAction("/invoices/create")).toBe(false);
  });

  it("hides the action on an invoice edit route", () => {
    expect(showNewInvoiceAction("/invoices/abc123/edit")).toBe(false);
  });

  it("hides the action on unrelated routes", () => {
    expect(showNewInvoiceAction("/brands")).toBe(false);
    expect(showNewInvoiceAction("/clients")).toBe(false);
  });
});
