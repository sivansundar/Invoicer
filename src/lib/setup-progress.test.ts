import { describe, expect, it } from "vitest";
import { buildSetupProgress } from "./setup-progress";
import { validBrand, validClient, validInvoice } from "@/test/factories";
import type { BankDetails } from "./types";

const payable: BankDetails = {
  accountName: "Sivan Studio",
  accountNumber: "000123456789",
  bankName: "HDFC Bank",
  ifscCode: "HDFC0001234",
};

const empty = { brands: [], clients: [], invoices: [] };

describe("buildSetupProgress", () => {
  it("has nothing done for a brand-new account", () => {
    const progress = buildSetupProgress(empty);

    expect(progress.done).toBe(0);
    expect(progress.total).toBe(4);
    expect(progress.complete).toBe(false);
    expect(progress.next?.id).toBe("brand");
    expect(progress.next?.href).toBe("/brands/create");
  });

  it("moves on to payment details once a brand exists without them", () => {
    const progress = buildSetupProgress({
      ...empty,
      brands: [validBrand({ id: "b1" })],
    });

    expect(progress.done).toBe(1);
    expect(progress.next?.id).toBe("payment");
    // The href edits the brand that is actually missing them, not the list.
    expect(progress.next?.href).toBe("/brands/b1/edit");
  });

  it("counts payment details as done only when every brand has them", () => {
    const withDetails = validBrand({ id: "b1", bankDetails: payable });
    const without = validBrand({ id: "b2" });

    expect(buildSetupProgress({ ...empty, brands: [withDetails] }).done).toBe(2);

    const mixed = buildSetupProgress({ ...empty, brands: [withDetails, without] });
    expect(mixed.next?.id).toBe("payment");
    expect(mixed.next?.href).toBe("/brands/b2/edit");
  });

  it("treats a single filled bank field as payment details, like the invoice document does", () => {
    const progress = buildSetupProgress({
      ...empty,
      brands: [validBrand({ bankDetails: { ...payable, accountNumber: "", bankName: "", ifscCode: "" } })],
    });

    expect(progress.steps.find((step) => step.id === "payment")?.done).toBe(true);
  });

  it("ignores whitespace-only bank details", () => {
    const progress = buildSetupProgress({
      ...empty,
      brands: [
        validBrand({
          bankDetails: { accountName: "  ", accountNumber: " ", bankName: "", ifscCode: "" },
        }),
      ],
    });

    expect(progress.steps.find((step) => step.id === "payment")?.done).toBe(false);
  });

  it("asks for a client next, then an invoice", () => {
    const brands = [validBrand({ bankDetails: payable })];

    const needsClient = buildSetupProgress({ ...empty, brands });
    expect(needsClient.next?.id).toBe("client");
    expect(needsClient.next?.href).toBe("/clients/create");

    const needsInvoice = buildSetupProgress({ ...empty, brands, clients: [validClient()] });
    expect(needsInvoice.done).toBe(3);
    expect(needsInvoice.next?.id).toBe("invoice");
    expect(needsInvoice.next?.href).toBe("/invoices/create");
  });

  it("is complete, with no next step, once every step is satisfied", () => {
    const progress = buildSetupProgress({
      brands: [validBrand({ bankDetails: payable })],
      clients: [validClient()],
      invoices: [validInvoice()],
    });

    expect(progress.done).toBe(4);
    expect(progress.complete).toBe(true);
    expect(progress.next).toBeNull();
  });

  it("does not credit the payment step for an account with no brands at all", () => {
    const progress = buildSetupProgress({
      ...empty,
      clients: [validClient()],
      invoices: [validInvoice()],
    });

    expect(progress.steps.find((step) => step.id === "payment")?.done).toBe(false);
    expect(progress.done).toBe(2);
  });

  it("gives every step a reason and an action label to render", () => {
    for (const step of buildSetupProgress(empty).steps) {
      expect(step.reason.length).toBeGreaterThan(0);
      expect(step.action.length).toBeGreaterThan(0);
      expect(step.href.startsWith("/")).toBe(true);
    }
  });
});
