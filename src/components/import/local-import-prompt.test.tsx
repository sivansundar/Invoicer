import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { LocalImportPrompt } from "./local-import-prompt";
import { resetFakeSeam } from "@/test/fake-seam";
import { validBrand, validInvoice } from "@/test/factories";
import { seed } from "@/test/fake-seam";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

function seedLocal(invoiceCount: number) {
  localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
  localStorage.setItem(
    "invoicer_invoices",
    JSON.stringify(
      Array.from({ length: invoiceCount }, (_, i) =>
        validInvoice({ id: `aaaaaaa1-0000-4000-8000-00000000${String(i).padStart(4, "0")}`, invoiceNumber: `INV-LOCAL-${i}` })
      )
    )
  );
}

describe("LocalImportPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFakeSeam();
  });

  it("says nothing when the device has no local data", () => {
    renderWithProviders(<LocalImportPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports the invoice count it found", async () => {
    seedLocal(14);
    renderWithProviders(<LocalImportPrompt />);
    expect(await screen.findByText(/14 invoices on this device/i)).toBeInTheDocument();
  });

  it("imports into the account when accepted", async () => {
    seedLocal(2);
    const { getInvoices } = await import("@/test/fake-seam");
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));

    await waitFor(async () => expect(await getInvoices()).toHaveLength(2));
  });

  // The load-bearing one.
  it("never deletes the local copy, even after a successful import", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(2);
  });

  it("offers to clear the local copy only after the result is on screen", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(screen.getByRole("button", { name: /clear local copy/i })).toBeInTheDocument();
  });

  // Falsifies a state-read-per-render bug: clearing the local copy must not
  // re-evaluate "is there local data" mid-interaction, or the dialog (and the
  // summary the user is still reading) would vanish out from under them.
  it("keeps showing the summary after Clear local copy is pressed", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    await userEvent.click(screen.getByRole("button", { name: /clear local copy/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /imported/i })).toBeInTheDocument();
  });

  it("stays dismissed across a remount", async () => {
    seedLocal(2);
    const { unmount } = renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /not now/i }));
    unmount();
    renderWithProviders(<LocalImportPrompt />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // This flow persists until dismissed, so the account it imports into is
  // often not fresh — an invoice number this device's local data used can
  // already belong to a real, server-side invoice created since signup.
  // Overwriting it would destroy something real; the local copy, by
  // contrast, is never deleted by this flow on its own, so discarding costs
  // nothing. The load-bearing assertion is `total`, not just the count: a
  // silent overwrite would still leave exactly one invoice under this
  // number, so length alone can't tell overwrite and discard apart.
  it("keeps the server's invoice untouched when a local one collides by number, and reports it discarded", async () => {
    seed({
      invoices: [
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000001",
          invoiceNumber: "INV-COLLIDE",
          total: 5000,
        }),
      ],
    });
    localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
    localStorage.setItem(
      "invoicer_invoices",
      JSON.stringify([
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000099",
          invoiceNumber: "INV-COLLIDE",
          total: 9999,
        }),
      ])
    );
    const { getInvoices } = await import("@/test/fake-seam");

    renderWithProviders(<LocalImportPrompt />);
    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    const serverInvoices = await getInvoices();
    expect(serverInvoices).toHaveLength(1);
    // Still the server's own total, not the local device's — an overwrite
    // would have replaced it with 9999.
    expect(serverInvoices[0].total).toBe(5000);

    expect(screen.getByText(/1 invoice already in your account/i)).toBeInTheDocument();
  });

  // A discarded invoice was never written anywhere but this device — the
  // discard resolver above only stops it from clobbering the server's copy,
  // it does nothing to protect the device's own copy of the same record.
  // "Clear local copy" writes an invoicer_* key (the one thing in this flow
  // that does), so it must not be offered here: one click later, the only
  // surviving copy of the discarded invoice would be gone too.
  it("does not offer Clear local copy when an invoice was discarded, and keeps the local keys intact", async () => {
    seed({
      invoices: [
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000001",
          invoiceNumber: "INV-COLLIDE",
          total: 5000,
        }),
      ],
    });
    localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
    localStorage.setItem(
      "invoicer_invoices",
      JSON.stringify([
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000099",
          invoiceNumber: "INV-COLLIDE",
          total: 9999,
        }),
      ])
    );

    renderWithProviders(<LocalImportPrompt />);
    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("invoicer_brands")!)).toHaveLength(1);
  });

  it("keeps the local copy when the import fails", async () => {
    seedLocal(2);
    const { failNext } = await import("@/test/fake-seam");
    failNext("createInvoice", "network down");
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));

    await screen.findByText(/could not|failed/i);
    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();
  });
});
