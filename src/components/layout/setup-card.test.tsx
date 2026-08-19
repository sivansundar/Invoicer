import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETUP_DISMISSED_KEY, SetupCard } from "./setup-card";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import { validBrand, validClient, validInvoice } from "@/test/factories";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

const payable = {
  accountName: "Sivan Studio",
  accountNumber: "000123456789",
  bankName: "HDFC Bank",
  ifscCode: "HDFC0001234",
};

/**
 * Rendered beside the card in the tests that assert it is absent. The card
 * is hidden while the three queries are pending, so those assertions pass on
 * the first frame for the wrong reason — and would keep passing if the card
 * were broken. Waiting for this to appear moves them past the point the card
 * would have rendered, so the absence is the one under test.
 */
function RecordsLoaded() {
  const { loading: brandsLoading } = useBrands();
  const { loading: clientsLoading } = useClients();
  const { loading: invoicesLoading } = useInvoices();

  if (brandsLoading || clientsLoading || invoicesLoading) return null;
  return <div>records loaded</div>;
}

describe("SetupCard", () => {
  beforeEach(() => {
    resetFakeSeam();
    window.localStorage.clear();
  });

  it("shows the first outstanding step, with a link that completes it", async () => {
    renderWithProviders(<SetupCard />);

    expect(await screen.findByText("Finish setup")).toBeInTheDocument();
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add brand" })).toHaveAttribute(
      "href",
      "/brands/create"
    );
  });

  it("moves to the brand that is missing bank details once one exists", async () => {
    seed({ brands: [validBrand({ id: "b1" })] });
    renderWithProviders(<SetupCard />);

    expect(await screen.findByText("1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add details" })).toHaveAttribute(
      "href",
      "/brands/b1/edit"
    );
  });

  it("renders nothing once every step is done", async () => {
    seed({
      brands: [validBrand({ bankDetails: payable })],
      clients: [validClient()],
      invoices: [validInvoice()],
    });
    renderWithProviders(
      <>
        <SetupCard />
        <RecordsLoaded />
      </>
    );

    await screen.findByText("records loaded");
    expect(screen.queryByText("Finish setup")).not.toBeInTheDocument();
    expect(screen.queryByText("4 of 4")).not.toBeInTheDocument();
  });

  it("dismisses for good when Skip is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetupCard />);

    await user.click(await screen.findByRole("button", { name: "Skip" }));

    expect(screen.queryByText("Finish setup")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SETUP_DISMISSED_KEY)).toBe("1");
  });

  it("stays dismissed on a later visit", async () => {
    // No fixtures, so every step is outstanding: the first test in this file
    // proves this exact seed renders the card. The dismissal is the only
    // thing keeping it away here.
    window.localStorage.setItem(SETUP_DISMISSED_KEY, "1");
    renderWithProviders(
      <>
        <SetupCard />
        <RecordsLoaded />
      </>
    );

    await screen.findByText("records loaded");
    expect(screen.queryByText("Finish setup")).not.toBeInTheDocument();
  });
});
