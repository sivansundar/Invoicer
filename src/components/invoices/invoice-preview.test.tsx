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

function renderPreview(
  overrides: Partial<BrandSnapshot> = {},
  clientOverrides: Partial<InvoiceClient> = {}
) {
  render(
    <InvoicePreview
      snapshot={snapshot(overrides)}
      client={{ ...client, ...clientOverrides }}
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

describe("InvoicePreview tax IDs", () => {
  it("renders the brand's GST and PAN under its address when present", () => {
    renderPreview({ gstNumber: "29ABCDE1234F1Z5", panNumber: "ABCDE1234F" });

    expect(screen.getByText("GST: 29ABCDE1234F1Z5")).toBeInTheDocument();
    expect(screen.getByText("PAN: ABCDE1234F")).toBeInTheDocument();
  });

  it("renders neither brand tax ID line when both are absent", () => {
    renderPreview({ gstNumber: undefined, panNumber: undefined });

    expect(screen.queryByText(/^GST:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^PAN:/)).not.toBeInTheDocument();
  });

  it("renders the client's contact name and GST under Billed to when present", () => {
    renderPreview({}, { name: "Priya Rao", gstNumber: "27AAAAA0000A1Z5" });

    expect(screen.getByText("Priya Rao")).toBeInTheDocument();
    expect(screen.getByText("GST: 27AAAAA0000A1Z5")).toBeInTheDocument();
  });

  it("renders no client contact name or GST line when absent", () => {
    renderPreview({}, { name: undefined, gstNumber: undefined });

    expect(screen.queryByText(/^GST:/)).not.toBeInTheDocument();
  });
});

describe("InvoicePreview design dispatch", () => {
  // The classic design renders an explicit line-item table header
  // ("Description"/"Amount"/"Tax"/"Total") that the modern design has no
  // equivalent of — a reliable signal for which design actually rendered
  // without reaching into either design's internals.
  it("renders the modern design when the snapshot carries no invoiceDesign", () => {
    renderPreview({ invoiceDesign: undefined });

    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("renders the modern design when the snapshot explicitly says modern", () => {
    renderPreview({ invoiceDesign: "modern" });

    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("renders the classic design when the snapshot says classic", () => {
    renderPreview({ invoiceDesign: "classic" });

    expect(screen.getByText("Description")).toBeInTheDocument();
  });
});
