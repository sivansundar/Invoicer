import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./page";
import { renderWithProviders, testQueryClientOptions } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import { validBrand as brand, validInvoice as invoice } from "@/test/factories";

// Brands are in Postgres now; invoices are not yet. The fake mirrors both —
// see src/test/fake-seam.ts.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

vi.mock("sonner", () => ({ toast: vi.fn() }));

function skeletonCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-slot="skeleton"]').length;
}

function jsonFile(payload: unknown, name = "invoicer-backup.json"): File {
  return new File([JSON.stringify(payload)], name, { type: "application/json" });
}

function uploadBackup(container: HTMLElement, payload: unknown) {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [jsonFile(payload)] } });
}

beforeEach(() => {
  resetFakeSeam();
});

describe("ReportsPage", () => {
  it("shows a skeleton until both brands and invoices have arrived", async () => {
    // Both, not either: the summary dialog reads them together, and a report
    // rendered with one still empty is silently missing rows.
    seed({ brands: [brand()], invoices: [invoice()] });

    const { container } = renderWithProviders(<ReportsPage />);

    // First frame: skeleton, and crucially not the real content rendering
    // early against incomplete (empty-default) data.
    expect(skeletonCount(container)).toBeGreaterThan(0);
    expect(screen.queryByText("Financial year summary")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Financial year summary")).toBeInTheDocument()
    );
    expect(screen.getByText("Financial year summary")).toBeInTheDocument();
    expect(skeletonCount(container)).toBe(0);
  });

  it("invalidates the query cache after an import completes", async () => {
    // ImportExport writes through the seam directly, bypassing the mutation
    // layer that owns onSettled invalidation. With refetchOnWindowFocus off
    // and a nonzero staleTime, nothing else would refetch — a screen already
    // rendered from an empty cache would keep showing it.
    seed({ brands: [brand()] });

    const client = new QueryClient({ defaultOptions: testQueryClientOptions });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { container } = renderWithProviders(<ReportsPage />, { queryClient: client });
    await waitFor(() =>
      expect(screen.getByText("Financial year summary")).toBeInTheDocument()
    );

    uploadBackup(container, {
      version: 2,
      brands: [brand({ id: "bbbbbbb1-0000-4000-8000-000000000002", name: "Second" })],
      clients: [],
      templates: [],
      invoices: [],
    });

    await waitFor(() => expect(screen.getByText("Import Complete")).toBeInTheDocument());
    // No arguments: the unfiltered `invalidateQueries()` is the load-bearing
    // part. An import writes brands, clients, templates and invoices
    // together (reports/page.tsx documents why), so a regression that
    // narrows this to a single `queryKey` would still satisfy a bare
    // `toHaveBeenCalled()` while reintroducing the stale-cache bug this test
    // exists to catch.
    expect(invalidate).toHaveBeenCalledWith();
  });
});
