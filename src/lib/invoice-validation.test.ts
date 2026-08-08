import { describe, expect, it } from "vitest";
import {
  describeInvoiceValidationError,
  validateInvoiceForSave,
  type InvoiceValidationInput,
} from "./invoice-validation";

function validInput(overrides: Partial<InvoiceValidationInput> = {}): InvoiceValidationInput {
  return {
    brandId: "b1",
    clientSelected: true,
    client: { companyName: "Acme Studio", address: "12 Residency Rd" },
    billDate: "2026-07-01",
    dueDate: "2026-07-15",
    currency: "INR",
    items: [{ description: "Design work", amount: 5000 }],
    ...overrides,
  };
}

describe("validateInvoiceForSave", () => {
  it("passes a fully-valid invoice", () => {
    expect(validateInvoiceForSave(validInput())).toEqual({ ok: true, fields: [] });
  });

  it("flags a missing brand", () => {
    const result = validateInvoiceForSave(validInput({ brandId: "" }));
    expect(result).toEqual({ ok: false, fields: ["brand"] });
  });

  it("flags no client chosen at all, without also flagging company/contact/address", () => {
    // Those three fields aren't even rendered until "Billed to" has a
    // selection — flagging them here would point at inputs the user can't
    // see yet.
    const result = validateInvoiceForSave(
      validInput({ clientSelected: false, client: { companyName: "", address: "" } })
    );
    expect(result).toEqual({ ok: false, fields: ["client"] });
  });

  it("flags a missing company name once a client is selected", () => {
    const result = validateInvoiceForSave(
      validInput({ client: { companyName: "  ", address: "12 Residency Rd" } })
    );
    expect(result).toEqual({ ok: false, fields: ["companyName"] });
  });

  it("never blocks on a missing contact name", () => {
    // A saved `Client` record can legitimately have no `name` (the client
    // form marks it Optional), and an invoice is addressed to a company
    // regardless. The form nudges for one inline; this gate must not fail
    // the save over it — `InvoiceValidationClient` doesn't even carry the
    // field, so there is nothing here to check.
    expect(validateInvoiceForSave(validInput())).toEqual({ ok: true, fields: [] });
  });

  it("flags a missing address", () => {
    const result = validateInvoiceForSave(
      validInput({ client: { companyName: "Acme Studio", address: "   " } })
    );
    expect(result).toEqual({ ok: false, fields: ["address"] });
  });

  it("flags a missing bill date", () => {
    const result = validateInvoiceForSave(validInput({ billDate: "" }));
    expect(result).toEqual({ ok: false, fields: ["billDate"] });
  });

  it("flags a missing due date", () => {
    const result = validateInvoiceForSave(validInput({ dueDate: "" }));
    expect(result).toEqual({ ok: false, fields: ["dueDate"] });
  });

  it("flags a missing currency", () => {
    const result = validateInvoiceForSave(validInput({ currency: "" }));
    expect(result).toEqual({ ok: false, fields: ["currency"] });
  });

  it("treats an empty line-item row as no line item at all", () => {
    const result = validateInvoiceForSave(
      validInput({ items: [{ description: "", amount: 0 }] })
    );
    expect(result).toEqual({ ok: false, fields: ["lineItems"] });
  });

  it("rejects a line item with a description but no positive amount", () => {
    const result = validateInvoiceForSave(
      validInput({ items: [{ description: "Design work", amount: 0 }] })
    );
    expect(result).toEqual({ ok: false, fields: ["lineItems"] });
  });

  it("accepts manual client entry with all three fields filled in", () => {
    const result = validateInvoiceForSave(
      validInput({
        client: { companyName: "One-off Client Ltd", address: "1 High St" },
      })
    );
    expect(result.ok).toBe(true);
  });

  it("reports several missing fields at once, still in form order", () => {
    const result = validateInvoiceForSave(
      validInput({
        brandId: "",
        billDate: "",
        client: { companyName: "  ", address: "12 Residency Rd" },
      })
    );
    expect(result).toEqual({ ok: false, fields: ["brand", "companyName", "billDate"] });
  });

  it("reports every field missing on a completely empty invoice", () => {
    const result = validateInvoiceForSave({
      brandId: "",
      clientSelected: false,
      client: { companyName: "", address: "" },
      billDate: "",
      dueDate: "",
      currency: "",
      items: [{ description: "", amount: 0, tax: 0 } as never],
    });
    expect(result.ok).toBe(false);
    expect(result.fields).toEqual(["brand", "client", "billDate", "dueDate", "currency", "lineItems"]);
  });
});

describe("describeInvoiceValidationError", () => {
  it("leads with the first field's specific message", () => {
    expect(describeInvoiceValidationError(["brand"])).toBe("Select a brand first");
    expect(describeInvoiceValidationError(["lineItems"])).toBe("Add at least one line item first");
  });

  it("uses the saved-client-friendly copy for a missing address", () => {
    expect(describeInvoiceValidationError(["address"])).toBe(
      "This client needs a billing address to continue"
    );
  });

  it("appends a hint when more than one field is missing", () => {
    expect(describeInvoiceValidationError(["brand", "billDate"])).toBe(
      "Select a brand first — a few other required fields need it too"
    );
  });
});
