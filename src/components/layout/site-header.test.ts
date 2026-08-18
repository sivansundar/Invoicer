import { describe, expect, it } from "vitest";
import { getCrumb, getHeaderAction, showExportAction } from "./site-header";

// Every row of the design handoff's breadcrumb table (task-10-brief.md), plus
// the two routes the redesign adds.
const CRUMB_CASES: Array<[path: string, crumb: string]> = [
  ["/dashboard", "Overview"],
  ["/invoices", "Invoices"],
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
  ["/followups/brands/abc123", "Follow-up history"],
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

  it("does not let the follow-up brand route read as a template", () => {
    expect(getCrumb("/followups/brands/abc123")).toBe("Follow-up history");
  });
});

describe("getHeaderAction", () => {
  it("offers a new invoice on the invoice-shaped screens", () => {
    for (const path of ["/dashboard", "/invoices", "/invoices/abc123"]) {
      expect(getHeaderAction(path)).toEqual({
        label: "New invoice",
        href: "/invoices/create",
      });
    }
  });

  it("varies the action with the screen", () => {
    expect(getHeaderAction("/brands")?.label).toBe("New brand");
    expect(getHeaderAction("/clients")?.label).toBe("New client");
    expect(getHeaderAction("/followups")?.label).toBe("New template");
  });

  // A form's own submit is the primary action; a second one in the header
  // would compete with it.
  it("offers nothing on a create or edit form", () => {
    for (const path of [
      "/invoices/create",
      "/invoices/abc123/edit",
      "/brands/create",
      "/brands/abc123/edit",
      "/clients/create",
      "/clients/abc123/edit",
      "/followups/templates/create",
    ]) {
      expect(getHeaderAction(path)).toBeNull();
    }
  });

  it("offers nothing on read-only screens", () => {
    expect(getHeaderAction("/reports")).toBeNull();
    expect(getHeaderAction("/followups/brands/abc123")).toBeNull();
  });
});

describe("showExportAction", () => {
  it("shows export where there is something to export", () => {
    expect(showExportAction("/dashboard")).toBe(true);
    expect(showExportAction("/invoices")).toBe(true);
    expect(showExportAction("/reports")).toBe(true);
    expect(showExportAction("/followups")).toBe(true);
  });

  it("hides export on forms and single records", () => {
    expect(showExportAction("/invoices/create")).toBe(false);
    expect(showExportAction("/brands")).toBe(false);
    expect(showExportAction("/clients")).toBe(false);
  });
});
