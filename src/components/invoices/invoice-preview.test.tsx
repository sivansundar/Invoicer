import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvoicePreview } from "./invoice-preview";
import type { BrandSnapshot, InvoiceClient } from "@/lib/types";

const client: InvoiceClient = {
  companyName: "Acme Corporation",
  address: "221B Baker Street",
};

function snapshot(overrides: Partial<BrandSnapshot> = {}): BrandSnapshot {
  return {
    name: "Stellar Consulting",
    address: "4th Floor, Prestige Tech Park",
    invoicePrefix: "SC",
    accentColor: "#6366f1",
    bankDetails: {
      accountName: "",
      accountNumber: "",
      bankName: "",
      ifscCode: "",
    },
    ...overrides,
  };
}

function renderPreview(overrides: Partial<BrandSnapshot> = {}) {
  render(
    <InvoicePreview
      snapshot={snapshot(overrides)}
      client={client}
      invoiceNumber="SC-2026-014"
      billDate="2026-07-21"
      dueDate="2026-08-04"
      items={[]}
      currency="INR"
      notes={undefined}
      isPaid={false}
    />
  );
}

describe("InvoicePreview header avatar", () => {
  it("renders the brand's logo when the snapshot carries one", () => {
    renderPreview({ logo: "data:image/png;base64,abc123" });

    const img = screen.getByRole("img", { name: "Stellar Consulting" });
    expect(img).toHaveAttribute("src", "data:image/png;base64,abc123");
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });

  it("falls back to the initial square when there is no logo", () => {
    renderPreview({ logo: undefined });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });
});
