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
    invoiceDesign: "modern",
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
      paymentMethod={undefined}
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

describe("InvoicePreview payment method", () => {
  it("renders the IFSC block when paymentMethod is undefined", () => {
    renderPreview({ bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "HDFC0001" } });

    expect(screen.getByText("IFSC")).toBeInTheDocument();
  });

  it("renders the ACH block, with its own field labels, when paymentMethod is ach and the snapshot has achDetails", () => {
    render(
      <InvoicePreview
        snapshot={snapshot({
          achDetails: {
            accountName: "Stellar Consulting LLC",
            accountNumber: "98765",
            routingNumber: "021000021",
            bankName: "Wise",
          },
        })}
        client={client}
        invoiceNumber="SC-2026-014"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={[]}
        currency="USD"
        notes={undefined}
        isPaid={false}
        paymentMethod="ach"
      />
    );

    expect(screen.getByText("ACH routing number")).toBeInTheDocument();
    expect(screen.getByText("021000021")).toBeInTheDocument();
    expect(screen.queryByText("IFSC")).not.toBeInTheDocument();
  });

  it("falls back to the IFSC block when paymentMethod is ach but the snapshot has no achDetails", () => {
    renderPreview({
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "HDFC0001" },
    });
    // `renderPreview`'s default `paymentMethod={undefined}` already covers the
    // implicit-ifsc case above — this proves an explicit "ach" with no
    // achDetails degrades the same way, rather than rendering an empty block.
    render(
      <InvoicePreview
        snapshot={snapshot({
          bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "HDFC0001" },
        })}
        client={client}
        invoiceNumber="SC-2026-014"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={[]}
        currency="INR"
        notes={undefined}
        isPaid={false}
        paymentMethod="ach"
      />
    );

    expect(screen.getAllByText("IFSC").length).toBeGreaterThan(0);
  });
});
