import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  // Reproduction 1 from the final-review finding: a record dropped by
  // `prepareImport`'s validation (never even reaches `writeImport`) is
  // invisible to a gate built only from `writeImport`'s own result. A line
  // item missing `tax` fails `isValidLineItem`, so the whole invoice is
  // skipped during validation — "Invoices imported" ends up smaller than
  // "we found N invoices," and the rejected invoice exists nowhere but this
  // device's `invoicer_invoices` key.
  it("withholds Clear local copy when prepareImport skipped a record during validation, and keeps the local keys intact", async () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
    localStorage.setItem(
      "invoicer_invoices",
      JSON.stringify([
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000001",
          invoiceNumber: "INV-OK",
        }),
        validInvoice({
          id: "aaaaaaa1-0000-4000-8000-000000000002",
          invoiceNumber: "INV-BAD",
          // Missing `tax` on the line item — fails `isValidLineItem`, so
          // this whole invoice is dropped by `prepareImport`, before
          // `writeImport` ever sees it.
          items: [{ id: "li1", description: "Broken line item", amount: 1000 } as never],
        }),
      ])
    );
    const { getInvoices } = await import("@/test/fake-seam");

    renderWithProviders(<LocalImportPrompt />);
    expect(await screen.findByText(/2 invoices on this device/i)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    // Only the valid one was ever written through.
    expect(await getInvoices()).toHaveLength(1);
    // The button is withheld...
    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();
    // ...and — the load-bearing assertion — both local records, including
    // the rejected one, are still sitting in the key untouched.
    expect(JSON.parse(localStorage.getItem("invoicer_invoices")!)).toHaveLength(2);
  });

  // Reproduction 2: a truncated write (e.g. from the old build hitting its
  // localStorage quota mid-save) leaves `invoicer_invoices` holding bytes
  // that are not valid JSON. `readArray`'s never-throws fallback returns
  // `[]` for it, which a gate built only from array length cannot tell
  // apart from "there was nothing here" — the prompt would report "we found
  // 0 invoices," offer the button anyway (because brands imported cleanly),
  // and delete the one copy of whatever those truncated bytes used to be.
  it("withholds Clear local copy when a local key is corrupt, and keeps the corrupt key's bytes intact", async () => {
    const corruptPayload = '[{"id":"aaaaaaa1-0000-4000-8000-000000000001","invoiceNumber":"IN';
    localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
    localStorage.setItem("invoicer_invoices", corruptPayload);

    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(screen.queryByRole("button", { name: /clear local copy/i })).not.toBeInTheDocument();
    // The load-bearing assertion: the corrupt key's raw bytes are still
    // there, verbatim — not re-parsed to "[]" and not deleted.
    expect(localStorage.getItem("invoicer_invoices")).toBe(corruptPayload);
  });

  // A device holding nothing BUT a corrupt key still renders the prompt
  // (`readLocalCollections` returns non-null for it), but `prepareImport`
  // never sees the corrupt key itself — only the empty arrays it parsed to
  // — so it fails with "the file was empty." That alone is the wrong
  // reason: the corrupt-key note must be shown in the `failed` stage too,
  // not just `done`, so the user also learns a key was unreadable rather
  // than being left thinking there was nothing here at all.
  it("tells a corrupt-only device its data was unreadable, alongside the failure", async () => {
    const corruptPayload = '[{"id":"aaaaaaa1-0000-4000-8000-000000000001","invoiceNumber":"IN';
    localStorage.setItem("invoicer_invoices", corruptPayload);

    renderWithProviders(<LocalImportPrompt />);
    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));

    expect(await screen.findByText(/couldn.t be read/i)).toBeInTheDocument();
  });

  // The all-clean case must still work — the fix above must not make the
  // gate permanently closed. Duplicates the coverage of the existing test
  // at the top of this file (kept passing, unmodified) as an explicit
  // contrast to the two tests above.
  it("still offers Clear local copy for a clean import with nothing skipped, discarded, corrupt or failed", async () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(screen.getByRole("button", { name: /clear local copy/i })).toBeInTheDocument();
  });

  // The title must reflect what was actually found, not just the invoice
  // count — a device holding brands or clients but no invoices otherwise
  // gets a modal headed "We found 0 invoices on this device," which reads
  // as if there was nothing to import at all.
  it("does not claim zero invoices were found when the device has other local data", async () => {
    localStorage.setItem("invoicer_brands", JSON.stringify([validBrand()]));
    renderWithProviders(<LocalImportPrompt />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/0 invoices/i)).not.toBeInTheDocument();
  });

  // Closing mid-import (ESC, the overlay, or the close button all route
  // through the same `onOpenChange`) must not permanently dismiss the
  // prompt — nothing is deleted, but the result (including any failures)
  // would otherwise never be shown, with no way to bring it back.
  it("does not dismiss the prompt when closed while an import is in flight", () => {
    seedLocal(2);
    renderWithProviders(<LocalImportPrompt />);

    fireEvent.click(screen.getByRole("button", { name: /import them/i }));
    // Still synchronous here — `handleImport` sets "importing" before its
    // first `await`, so this assertion pins that the click really did
    // leave the component mid-import, not already past it.
    expect(screen.getByRole("button", { name: /importing/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(localStorage.getItem("invoicer_import_prompt")).not.toBe("dismissed");
  });

  // The cache-invalidation gap: this writes through `writeImport` directly,
  // bypassing the `useBrands`/`useInvoices`/`useClients`/`useTemplates`
  // mutation layer that owns invalidation. Without it, a screen already
  // rendered from a stale (or empty) cache keeps showing that for up to
  // `staleTime` after the import completes.
  it("invalidates the query cache after a successful import", async () => {
    seedLocal(2);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <LocalImportPrompt />
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole("button", { name: /import them/i }));
    await screen.findByRole("heading", { name: /imported/i });

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
