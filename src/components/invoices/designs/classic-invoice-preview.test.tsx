import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassicInvoicePreview } from "./classic-invoice-preview";
import type { BrandSnapshot, InvoiceClient, LineItem } from "@/lib/types";

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
    invoiceDesign: "classic",
    bankDetails: {
      accountName: "",
      accountNumber: "",
      bankName: "",
      ifscCode: "",
    },
    ...overrides,
  };
}

function renderClassic(
  overrides: Partial<BrandSnapshot> = {},
  itemOverrides: LineItem[] = []
) {
  render(
    <ClassicInvoicePreview
      snapshot={snapshot(overrides)}
      client={client}
      invoiceNumber="SC-2026-014"
      billDate="2026-07-21"
      dueDate="2026-08-04"
      items={itemOverrides}
      currency="INR"
      notes={undefined}
      isPaid={false}
      paymentMethod={undefined}
      showAchAccountType={undefined}
      gstType={undefined}
    />
  );
}

describe("ClassicInvoicePreview tax IDs", () => {
  it("renders the brand's GST and PAN alongside its address", () => {
    renderClassic({ gstNumber: "29ABCDE1234F1Z5", panNumber: "ABCDE1234F" });

    expect(screen.getByText("GST: 29ABCDE1234F1Z5")).toBeInTheDocument();
    expect(screen.getByText("PAN: ABCDE1234F")).toBeInTheDocument();
  });

  it("renders the client's GST under Billed To when present", () => {
    render(
      <ClassicInvoicePreview
        snapshot={snapshot()}
        client={{ ...client, gstNumber: "27AAAAA0000A1Z5" }}
        invoiceNumber="SC-2026-014"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={[]}
        currency="INR"
        notes={undefined}
        isPaid={false}
        paymentMethod={undefined}
        showAchAccountType={undefined}
        gstType={undefined}
      />
    );

    expect(screen.getByText("GST: 27AAAAA0000A1Z5")).toBeInTheDocument();
  });
});

describe("ClassicInvoicePreview payment details", () => {
  it("renders nothing when every bank field is blank", () => {
    renderClassic();

    expect(screen.queryByText("Payment Details")).not.toBeInTheDocument();
  });

  it("renders only the populated fields, in order", () => {
    renderClassic({
      bankDetails: {
        accountName: "Stellar Consulting LLP",
        accountNumber: "",
        bankName: "HDFC Bank",
        ifscCode: "",
      },
    });

    expect(screen.getByText("Payment Details")).toBeInTheDocument();
    expect(screen.getByText("Stellar Consulting LLP")).toBeInTheDocument();
    expect(screen.getByText("HDFC Bank")).toBeInTheDocument();
    expect(screen.queryByText("Account number")).not.toBeInTheDocument();
  });

  it("gives a lone trailing field the full-width span class", () => {
    // Three populated fields (odd count) — the third and last one, UPI ID,
    // must span both grid columns instead of leaving an empty cell beside it.
    renderClassic({
      bankDetails: {
        accountName: "Stellar Consulting LLP",
        accountNumber: "",
        bankName: "HDFC Bank",
        ifscCode: "",
        upiId: "stellar@okhdfc",
      },
    });

    const upiValue = screen.getByText("stellar@okhdfc");
    const cell = upiValue.parentElement;
    expect(cell?.className).toContain("col-span-2");
  });
});

describe("ClassicInvoicePreview paid state", () => {
  it("shows a Paid badge when isPaid is true", () => {
    render(
      <ClassicInvoicePreview
        snapshot={snapshot()}
        client={client}
        invoiceNumber="SC-2026-014"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={[]}
        currency="INR"
        notes={undefined}
        isPaid={true}
        paymentMethod={undefined}
        showAchAccountType={undefined}
        gstType={undefined}
      />
    );

    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("shows no Paid badge when isPaid is false", () => {
    renderClassic();

    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });
});

describe("GST rendering", () => {
  const taxed: LineItem[] = [
    { id: "a", description: "Development", amount: 100000, tax: 18, sac: "998314" },
  ];

  it("splits CGST/SGST, names the place of supply and titles it TAX INVOICE for a registered brand", () => {
    render(
      <ClassicInvoicePreview
        snapshot={snapshot({ gstNumber: "29ABCDE1234F1Z5" })}
        client={{ ...client, stateCode: "29" }}
        invoiceNumber="SC-2026-014"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={taxed}
        currency="INR"
        notes={undefined}
        isPaid={false}
        paymentMethod={undefined}
        showAchAccountType={undefined}
        gstType="cgst_sgst"
      />
    );
    expect(screen.getByRole("heading", { name: "TAX INVOICE" })).toBeInTheDocument();
    expect(screen.getByText("Place of supply: Karnataka (29)")).toBeInTheDocument();
    expect(screen.getByText("CGST 9%")).toBeInTheDocument();
    expect(screen.getByText("SGST 9%")).toBeInTheDocument();
    expect(screen.getByText(/SAC 998314/)).toBeInTheDocument();
    expect(screen.queryByText(/export under bond/)).not.toBeInTheDocument();
  });

  it("prints the LUT declaration and Other country for an export", () => {
    render(
      <ClassicInvoicePreview
        snapshot={snapshot({ gstNumber: "29ABCDE1234F1Z5", lutArn: "AD2904250001234" })}
        client={client}
        invoiceNumber="SC-2026-015"
        billDate="2026-07-21"
        dueDate="2026-08-04"
        items={[{ id: "b", description: "Development", amount: 1500, tax: 0 }]}
        currency="USD"
        notes={undefined}
        isPaid={false}
        paymentMethod={undefined}
        showAchAccountType={undefined}
        gstType="export_lut"
      />
    );
    expect(screen.getByText("Place of supply: Other country (96)")).toBeInTheDocument();
    expect(screen.getByText("IGST 0%")).toBeInTheDocument();
    expect(screen.getByText(/without payment of integrated tax, LUT: AD2904250001234/)).toBeInTheDocument();
  });
});
