import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopeRow } from "./scope-row";
import {
  BrandFilterProvider,
  useBrandFilter,
} from "@/components/brand-filter/brand-filter-provider";
import { makeInvoice, validBrand } from "@/test/factories";
import type { Brand, Invoice } from "@/lib/types";

/** Proves the row drives the shared filter the sections read, not a local copy. */
function FilterProbe() {
  const { brandId } = useBrandFilter();
  return <span data-testid="filter">{brandId ?? "none"}</span>;
}

function brands(count: number): Brand[] {
  return Array.from({ length: count }, (_, i) =>
    validBrand({ id: `b${i + 1}`, name: `Brand ${i + 1}` })
  );
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return makeInvoice({ id: Math.random().toString(), ...overrides });
}

function renderRow(props: {
  invoices?: Invoice[];
  brands?: Brand[];
  year?: number | "all" | null;
  onYearChange?: (year: number | "all") => void;
}) {
  return render(
    <BrandFilterProvider>
      <ScopeRow
        invoices={props.invoices ?? [invoice({ billDate: "2026-05-01" })]}
        brands={props.brands ?? []}
        year={props.year ?? null}
        onYearChange={props.onYearChange ?? (() => {})}
      />
      <FilterProbe />
    </BrandFilterProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("the year control", () => {
  it("states the year rather than offering it when the book has only one", () => {
    renderRow({ invoices: [invoice({ billDate: "2026-05-01" })] });

    expect(screen.getByText("FY 2026-27")).toBeInTheDocument();
    expect(screen.queryByLabelText("Financial year")).not.toBeInTheDocument();
  });

  it("offers every year on the books plus the way out to all of them", async () => {
    const onYearChange = vi.fn();
    renderRow({
      invoices: [invoice({ billDate: "2026-05-01" }), invoice({ billDate: "2025-05-01" })],
      onYearChange,
    });

    const select = screen.getByLabelText("Financial year");
    expect(
      [...select.querySelectorAll("option")].map((option) => option.textContent)
    ).toEqual(["All years", "FY 2026-27", "FY 2025-26"]);
    // Defaults to the most recent year present, not to all of them.
    expect(select).toHaveValue("2026");

    await userEvent.selectOptions(select, "2025");
    expect(onYearChange).toHaveBeenCalledWith(2025);
  });

  it("renders nothing at all for an empty book with no brands", () => {
    const { container } = renderRow({ invoices: [], brands: [] });

    expect(container.querySelector("[role=group]")).toBeNull();
    expect(screen.queryByText(/^FY /)).not.toBeInTheDocument();
  });
});

describe("the brand control", () => {
  it("stays away when there is nothing to choose between", () => {
    renderRow({ brands: brands(1) });

    expect(screen.queryByRole("group", { name: "Brand" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Brand")).not.toBeInTheDocument();
  });

  it("writes the picked brand to the filter the dashboard sections read", async () => {
    renderRow({ brands: brands(2) });

    const group = screen.getByRole("group", { name: "Brand" });
    expect(screen.getByRole("button", { name: "All brands" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.click(screen.getByRole("button", { name: "Brand 2" }));

    expect(screen.getByTestId("filter")).toHaveTextContent("b2");
    expect(screen.getByRole("button", { name: "Brand 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(group).toBeInTheDocument();
  });

  it("shows a brand the sidebar switcher already picked as the active segment", () => {
    window.localStorage.setItem("invoicer_brand_filter", "b2");
    renderRow({ brands: brands(2) });

    expect(screen.getByRole("button", { name: "Brand 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("reads a brand that has since been deleted as all brands", () => {
    window.localStorage.setItem("invoicer_brand_filter", "gone");
    renderRow({ brands: brands(2) });

    expect(screen.getByRole("button", { name: "All brands" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("falls back to a select once the segments would overflow the row", async () => {
    renderRow({ brands: brands(6) });

    expect(screen.queryByRole("group", { name: "Brand" })).not.toBeInTheDocument();
    const select = screen.getByLabelText("Brand");

    await userEvent.selectOptions(select, "b5");
    expect(screen.getByTestId("filter")).toHaveTextContent("b5");
  });
});

describe("overdue outside the year in scope", () => {
  const stale = invoice({
    billDate: "2020-06-01",
    dueDate: "2020-06-15",
    status: "sent",
    brandId: "b1",
  });
  const current = invoice({ billDate: "2026-05-01", brandId: "b1" });

  it("says how much the year scope is hiding, and widens it", async () => {
    const onYearChange = vi.fn();
    renderRow({ invoices: [stale, current], onYearChange });

    const button = screen.getByRole("button", { name: /overdue outside FY 2026-27/ });
    expect(button).toHaveTextContent("1 overdue outside FY 2026-27");

    await userEvent.click(button);
    expect(onYearChange).toHaveBeenCalledWith("all");
  });

  it("goes away once the scope is wide enough to include it", () => {
    renderRow({ invoices: [stale, current], year: "all" });

    expect(screen.queryByText(/overdue outside/)).not.toBeInTheDocument();
  });

  it("stays away when nothing overdue is hidden", () => {
    renderRow({
      invoices: [invoice({ billDate: "2020-06-01", status: "paid" }), current],
    });

    expect(screen.queryByText(/overdue outside/)).not.toBeInTheDocument();
  });
});
