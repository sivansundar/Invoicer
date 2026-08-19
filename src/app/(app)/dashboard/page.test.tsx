import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import { makeInvoice, validBrand } from "@/test/factories";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

/**
 * The scope row is only worth having if it changes what the sections below
 * it show. These render the real dashboard and check the invoice table, the
 * furthest thing down the screen from the control.
 */
const CURRENT = makeInvoice({
  id: "i1",
  invoiceNumber: "INV-CURRENT",
  billDate: "2026-05-01",
  dueDate: "2026-05-20",
  status: "paid",
});
const EARLIER = makeInvoice({
  id: "i2",
  invoiceNumber: "INV-EARLIER",
  billDate: "2025-05-01",
  dueDate: "2025-05-20",
  status: "paid",
});

function renderDashboard() {
  return renderWithProviders(
    <BrandFilterProvider>
      <DashboardPage />
    </BrandFilterProvider>
  );
}

beforeEach(() => {
  resetFakeSeam();
  window.localStorage.clear();
});

describe("the dashboard's financial-year scope", () => {
  it("opens on the most recent year and hands only that year's invoices down", async () => {
    seed({ brands: [validBrand({ id: "b1" })], invoices: [CURRENT, EARLIER] });
    renderDashboard();

    await waitFor(() => expect(screen.getByText("INV-CURRENT")).toBeInTheDocument());
    expect(screen.queryByText("INV-EARLIER")).not.toBeInTheDocument();
  });

  it("hands down the year the reader picks instead", async () => {
    seed({ brands: [validBrand({ id: "b1" })], invoices: [CURRENT, EARLIER] });
    renderDashboard();

    await waitFor(() => expect(screen.getByLabelText("Financial year")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Financial year"), "2025");

    expect(screen.getByText("INV-EARLIER")).toBeInTheDocument();
    expect(screen.queryByText("INV-CURRENT")).not.toBeInTheDocument();
  });

  it("leaves every invoice in place when the scope is widened to all years", async () => {
    seed({ brands: [validBrand({ id: "b1" })], invoices: [CURRENT, EARLIER] });
    renderDashboard();

    await waitFor(() => expect(screen.getByLabelText("Financial year")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Financial year"), "all");

    expect(screen.getByText("INV-CURRENT")).toBeInTheDocument();
    expect(screen.getByText("INV-EARLIER")).toBeInTheDocument();
  });

  it("shows no scope row at all for an account with no invoices and no brands", async () => {
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Needs you")).toBeInTheDocument());
    expect(screen.queryByLabelText("Financial year")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Brand" })).not.toBeInTheDocument();
  });
});
