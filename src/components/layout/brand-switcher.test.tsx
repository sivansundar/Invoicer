import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandSwitcher } from "./brand-switcher";
import {
  BrandFilterProvider,
  useBrandFilter,
} from "@/components/brand-filter/brand-filter-provider";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import { validBrand } from "@/test/factories";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const STORAGE_KEY = "invoicer_brand_filter";

/** The state every dashboard section reads to decide what it shows. */
function FilterProbe() {
  const { brandId } = useBrandFilter();
  return <span data-testid="filter">{brandId ?? "none"}</span>;
}

function renderSwitcher() {
  return renderWithProviders(
    <BrandFilterProvider>
      <BrandSwitcher />
      <FilterProbe />
    </BrandFilterProvider>
  );
}

beforeEach(() => {
  resetFakeSeam();
  localStorage.clear();
});

describe("BrandSwitcher stale filter reconciliation", () => {
  // The failure this prevents is silent and baffling rather than loud: every
  // dashboard section filters to a brand that no longer exists and shows an
  // empty book, while the switcher resolves the missing brand to null and
  // says "All brands".
  it("clears a stored filter naming a brand this account no longer has", async () => {
    seed({ brands: [validBrand({ id: "b1", name: "Sundar Consulting" })] });
    localStorage.setItem(STORAGE_KEY, "deleted-brand");

    renderSwitcher();

    await waitFor(() => expect(screen.getByTestId("filter")).toHaveTextContent("none"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByText("All brands")).toBeInTheDocument();
  });

  it("leaves a filter naming a brand that still exists alone", async () => {
    seed({ brands: [validBrand({ id: "b1", name: "Sundar Consulting" })] });
    localStorage.setItem(STORAGE_KEY, "b1");

    renderSwitcher();

    await waitFor(() => expect(screen.getByText("Sundar Consulting")).toBeInTheDocument());
    expect(screen.getByTestId("filter")).toHaveTextContent("b1");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("b1");
  });

  // The brand list is empty while the query is pending, which looks exactly
  // like "this brand was deleted". Clearing then would wipe a valid filter on
  // every page load.
  it("does not clear the filter before the brands have loaded", async () => {
    seed({ brands: [validBrand({ id: "b1", name: "Sundar Consulting" })] });
    localStorage.setItem(STORAGE_KEY, "b1");

    renderSwitcher();

    expect(screen.getByTestId("filter")).toHaveTextContent("b1");
    await waitFor(() => expect(screen.getByText("Sundar Consulting")).toBeInTheDocument());
    expect(localStorage.getItem(STORAGE_KEY)).toBe("b1");
  });
});
