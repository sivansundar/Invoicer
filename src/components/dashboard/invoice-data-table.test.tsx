import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { InvoiceDataTable } from "./invoice-data-table";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import type { Invoice } from "@/lib/types";

function inv(index: number, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `id-${index}`,
    invoiceNumber: `INV-${String(index).padStart(3, "0")}`,
    brandId: "b1",
    currency: "INR",
    status: "sent",
    billDate: "2026-07-01",
    dueDate: "2026-07-20",
    client: { companyName: `Client ${index}`, address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 1000 + index,
    createdAt: new Date(2026, 0, index + 1).toISOString(),
    updatedAt: "",
    brandSnapshot: {
      name: "Brand One",
      address: "",
      invoicePrefix: "BR",
      accentColor: "#4f46e5",
      bankDetails: {
        accountName: "",
        accountNumber: "",
        bankName: "",
        ifscCode: "",
      },
    },
    clientId: null,
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

// 15 invoices -> two pages at the default page size of 10, sorted newest
// (highest index) first.
const FIFTEEN_INVOICES = Array.from({ length: 15 }, (_, i) => inv(i));

function renderTable(invoices: Invoice[]) {
  return render(
    <BrandFilterProvider>
      <InvoiceDataTable invoices={invoices} />
    </BrandFilterProvider>
  );
}

describe("InvoiceDataTable", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("resets to page 1 when the search text narrows the result set while on page 2", async () => {
    const user = userEvent.setup();
    renderTable(FIFTEEN_INVOICES);

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    // The oldest invoice (index 0) only appears on page 1 of the unfiltered
    // list. Searching for it while sitting on page 2 must not leave the
    // table showing "Page 2 of 1" or an empty page — it must reset to 1.
    await user.type(screen.getByPlaceholderText("Search invoices…"), "INV-000");

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Client 0")).toBeInTheDocument();
  });

  it("resets to page 1 when the tab changes while on page 2, and the empty state never lies", async () => {
    const user = userEvent.setup();
    renderTable(FIFTEEN_INVOICES);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    // None of the fixture invoices are "paid".
    await user.click(screen.getByRole("button", { name: /^Paid/ }));

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("No invoices")).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(
      screen.getByText("No invoices match this filter — calm, isn't it?")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("resets to page 1 when the page size changes", async () => {
    const user = userEvent.setup();
    renderTable(FIFTEEN_INVOICES);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("10"), "20");

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("searches case-insensitively across invoice number and client company name", async () => {
    const user = userEvent.setup();
    renderTable(FIFTEEN_INVOICES);

    await user.type(screen.getByPlaceholderText("Search invoices…"), "client 12");
    expect(screen.getByText("Client 12")).toBeInTheDocument();
    expect(screen.queryByText("Client 3")).not.toBeInTheDocument();
  });

  it("routes each row to its invoice detail page", () => {
    renderTable(FIFTEEN_INVOICES.slice(0, 3));
    const link = screen.getByRole("link", { name: /Client 2/ });
    expect(link).toHaveAttribute("href", "/invoices/id-2");
  });

  it("hides and restores the Amount column via the Columns menu", async () => {
    const user = userEvent.setup();
    renderTable(FIFTEEN_INVOICES.slice(0, 2));

    expect(screen.getByText("Amount")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /columns/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Amount"));
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Amount")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /columns/i }));
    const menuAgain = await screen.findByRole("menu");
    await user.click(within(menuAgain).getByText("Amount"));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Amount")).toBeInTheDocument();
  });
});
