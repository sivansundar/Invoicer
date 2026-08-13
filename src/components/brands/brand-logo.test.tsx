import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { BrandLogo } from "./brand-logo";
import { resetFakeSeam } from "@/test/fake-seam";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

describe("BrandLogo", () => {
  beforeEach(() => resetFakeSeam());

  it("renders a legacy base64 logo directly, without signing anything", async () => {
    const { getLogoUrl } = await import("@/test/fake-seam");
    renderWithProviders(<BrandLogo source={{ logo: "data:image/png;base64,aGk=" }} name="Acme" />);

    expect(await screen.findByRole("img", { name: "Acme" })).toHaveAttribute(
      "src",
      "data:image/png;base64,aGk="
    );
    expect(getLogoUrl).not.toHaveBeenCalled();
  });

  it("signs a URL for a path-backed logo", async () => {
    renderWithProviders(<BrandLogo source={{ logoPath: "b1/abc.png" }} name="Acme" />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Acme" })).toHaveAttribute(
        "src",
        "https://signed.test/b1/abc.png"
      )
    );
  });

  it("prefers the path when a snapshot somehow carries both", async () => {
    renderWithProviders(
      <BrandLogo source={{ logo: "data:image/png;base64,aGk=", logoPath: "b1/abc.png" }} name="Acme" />
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Acme" })).toHaveAttribute(
        "src",
        "https://signed.test/b1/abc.png"
      )
    );
  });

  it("falls back to the initial when there is no logo at all", () => {
    renderWithProviders(<BrandLogo source={{}} name="acme" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the initial rather than a broken image when signing fails", async () => {
    const { failNext, getLogoUrl } = await import("@/test/fake-seam");
    failNext("getLogoUrl", "signing failed");
    // vitest does not clear mock call history between tests in this file, so
    // this starts from a known count rather than assuming it's zero.
    getLogoUrl.mockClear();
    renderWithProviders(<BrandLogo source={{ logoPath: "b1/abc.png" }} name="Acme" />);

    // "A" is also what renders during the initial, still-loading render, so
    // asserting on it alone would pass even if the post-error branch leaked
    // a stale src — this must wait for the underlying call to actually
    // settle (reject) before checking that the fallback is still on screen.
    await waitFor(() => expect(getLogoUrl).toHaveBeenCalledTimes(1));
    await getLogoUrl.mock.results[0].value.catch(() => {});
    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses ? when the name is empty", () => {
    renderWithProviders(<BrandLogo source={{}} name="  " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
