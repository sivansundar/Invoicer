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

// 25 invoices -> three pages at the default page size of 10 (page 3 holds the
// remaining 5). 15 of them are "paid", 10 are "sent", so switching to the
// Paid tab still leaves TWO pages (ceil(15/10)) rather than collapsing to
// one. This is what makes the reset-to-1 assertion below discriminating: the
// pipeline's own out-of-range clamp (min(page, totalPages)) would land on
// page 2 here, not page 1 — only an explicit reset produces page 1.
const TWENTY_FIVE_BY_STATUS = Array.from({ length: 25 }, (_, i) =>
  inv(i, { status: i < 15 ? "paid" : "sent" })
);

// Same shape, but the split is encoded in the invoice number instead of
// status, for the search-text trigger: 15 invoices contain "MATCH", so
// searching for it still leaves 2 pages, not 1.
const TWENTY_FIVE_BY_NUMBER = Array.from({ length: 25 }, (_, i) =>
  inv(i, { invoiceNumber: i < 15 ? `MATCH-${i}` : `OTHER-${i}` })
);

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

  it("resets to page 1 (not clamps to page 2) when the tab changes while on page 3, even though the filtered set still spans 2 pages", async () => {
    const user = userEvent.setup();
    renderTable(TWENTY_FIVE_BY_STATUS);

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // 15 invoices are "paid" -> 2 pages at pageSize 10. A bare clamp
    // (min(page, totalPages)) would land on page 2, not page 1.
    await user.click(screen.getByRole("button", { name: /^Paid/ }));

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Page 2 of 2")).not.toBeInTheDocument();
  });

  it("resets to page 1 (not clamps to page 2) when the search text narrows the set while on page 3, even though the filtered set still spans 2 pages", async () => {
    const user = userEvent.setup();
    renderTable(TWENTY_FIVE_BY_NUMBER);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // 15 invoice numbers contain "MATCH" -> 2 pages at pageSize 10. A bare
    // clamp would land on page 2, not page 1.
    await user.type(screen.getByPlaceholderText("Search invoices…"), "match");

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Page 2 of 2")).not.toBeInTheDocument();
  });

  it("resets to page 1 (not clamps to page 2) when the page size changes while on page 3, even though the resized set still spans 2 pages", async () => {
    const user = userEvent.setup();
    renderTable(TWENTY_FIVE_BY_STATUS);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // 25 rows at pageSize 20 -> ceil(25/20) = 2 pages. A bare clamp
    // (min(3, 2)) would land on page 2, not page 1.
    await user.selectOptions(screen.getByDisplayValue("10"), "20");

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Page 2 of 2")).not.toBeInTheDocument();
  });

  it("shows an honest empty state (not 'Showing 1–0 of 0') when a filter leaves zero matches", async () => {
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
