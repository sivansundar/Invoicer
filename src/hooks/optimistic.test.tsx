import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failNext, resetFakeSeam, seed } from "@/test/fake-seam";
import { optimisticRemove, optimisticUpsert } from "./optimistic";
import { useBrands } from "./use-brands";
import { useClients } from "./use-clients";
import { useInvoices } from "./use-invoices";
import { useTemplates } from "./use-templates";
import type { Brand, Client, EmailTemplate, Invoice } from "@/lib/types";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

/**
 * Optimistic updates are only safe if they roll back.
 *
 * Showing a change immediately and leaving it on screen after the write
 * failed is worse than not being optimistic at all: the user is looking at a
 * value the database does not hold and has no reason to doubt it. Each hook
 * gets the same two checks — the change appears before the server answers,
 * and the previous value is restored when the server refuses.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "b1",
    name: "Original",
    address: "",
    email: "",
    invoicePrefix: "OG",
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: false,
      mode: "weekly",
      weekday: 1,
      time: "09:00",
      repeat: "week",
      templateId: "",
      stopAfter: 0,
    },
    invoiceDesign: "modern",
    ...overrides,
  };
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    companyName: "Original Co",
    address: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "t1",
    name: "Original Template",
    subject: "",
    tone: "Friendly",
    body: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    invoiceNumber: "OG-2026-001",
    brandId: "b1",
    clientId: null,
    currency: "INR",
    status: "sent",
    billDate: "2026-06-01",
    dueDate: "2026-06-15",
    client: { companyName: "Acme", address: "" },
    items: [],
    subtotal: 0,
    totalTax: 0,
    total: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    brandSnapshot: {
      name: "Original",
      address: "",
      invoicePrefix: "OG",
      accentColor: "#2563eb",
      invoiceDesign: "modern",
      bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    },
    reminders: [],
    followupsPaused: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetFakeSeam();
});

/**
 * The handlers on their own, with no hook and no refetch around them.
 *
 * This exists because the hook-level tests below cannot see the rollback:
 * `onSettled` invalidates, the refetch returns the server's unchanged data,
 * and the cache ends up correct whether or not `onError` put anything back.
 * Verified by deleting the rollback — every hook test still passed. The
 * window the rollback actually covers is between the failure and that
 * refetch, which is only reachable by driving the handlers directly.
 */
describe("the handlers themselves", () => {
  const KEY = ["things"] as const;

  function freshClient() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  }

  it("upsert puts the previous list back on error, before any refetch", async () => {
    const queryClient = freshClient();
    queryClient.setQueryData(KEY, [brand()]);
    const handlers = optimisticUpsert<Brand>(queryClient, KEY);

    const context = await handlers.onMutate(brand({ name: "Renamed" }));
    expect(queryClient.getQueryData<Brand[]>(KEY)![0].name).toBe("Renamed");

    handlers.onError(new Error("nope"), brand({ name: "Renamed" }), context);

    expect(queryClient.getQueryData<Brand[]>(KEY)![0].name).toBe("Original");
  });

  it("upsert appends an item that was not in the list", async () => {
    const queryClient = freshClient();
    queryClient.setQueryData(KEY, [brand()]);
    const handlers = optimisticUpsert<Brand>(queryClient, KEY);

    await handlers.onMutate(brand({ id: "b2", name: "Second" }));

    expect(queryClient.getQueryData<Brand[]>(KEY)).toHaveLength(2);
  });

  it("remove puts the removed item back on error", async () => {
    const queryClient = freshClient();
    queryClient.setQueryData(KEY, [brand()]);
    const handlers = optimisticRemove<Brand>(queryClient, KEY);

    const context = await handlers.onMutate("b1");
    expect(queryClient.getQueryData<Brand[]>(KEY)).toHaveLength(0);

    handlers.onError(new Error("nope"), "b1", context);

    expect(queryClient.getQueryData<Brand[]>(KEY)).toHaveLength(1);
  });

  it("does not write over a cache that filled up while the mutation was in flight", async () => {
    // The snapshot is `undefined` when nothing was cached at mutation time.
    // Restoring that literally would wipe whatever arrived since — which is
    // real data, not the stale value the rollback is meant to undo.
    const queryClient = freshClient();
    const handlers = optimisticUpsert<Brand>(queryClient, KEY);

    const context = await handlers.onMutate(brand({ name: "Renamed" }));
    expect(context.previous).toBeUndefined();

    queryClient.setQueryData(KEY, [brand({ name: "Arrived meanwhile" })]);
    handlers.onError(new Error("nope"), brand({ name: "Renamed" }), context);

    expect(queryClient.getQueryData<Brand[]>(KEY)![0].name).toBe("Arrived meanwhile");
  });
});

describe("useBrands", () => {
  it("shows the edit immediately, before the server answers", async () => {
    seed({ brands: [brand()] });
    const { result } = renderHook(() => useBrands(), { wrapper });
    await waitFor(() => expect(result.current.brands).toHaveLength(1));

    result.current.save(brand({ name: "Renamed" }));

    // No await on the mutation: this is the whole point — the new value is
    // on screen before the write completes.
    await waitFor(() => expect(result.current.brands[0].name).toBe("Renamed"));
  });

  it("restores the previous value when the save fails", async () => {
    seed({ brands: [brand()] });
    failNext("saveBrand");
    const { result } = renderHook(() => useBrands(), { wrapper });
    await waitFor(() => expect(result.current.brands).toHaveLength(1));

    await expect(result.current.save(brand({ name: "Renamed" }))).rejects.toThrow();

    await waitFor(() => expect(result.current.brands[0].name).toBe("Original"));
  });

  it("puts a removed brand back when the delete fails", async () => {
    seed({ brands: [brand()] });
    failNext("deleteBrand");
    const { result } = renderHook(() => useBrands(), { wrapper });
    await waitFor(() => expect(result.current.brands).toHaveLength(1));

    await expect(result.current.remove("b1")).rejects.toThrow();

    await waitFor(() => expect(result.current.brands).toHaveLength(1));
    expect(result.current.brands[0].name).toBe("Original");
  });
});

describe("useClients", () => {
  it("restores the previous value when the save fails", async () => {
    seed({ clients: [client()] });
    failNext("saveClient");
    const { result } = renderHook(() => useClients(), { wrapper });
    await waitFor(() => expect(result.current.clients).toHaveLength(1));

    await expect(result.current.save(client({ companyName: "Renamed Co" }))).rejects.toThrow();

    await waitFor(() => expect(result.current.clients[0].companyName).toBe("Original Co"));
  });

  it("puts a removed client back when the delete fails", async () => {
    seed({ clients: [client()] });
    failNext("deleteClient");
    const { result } = renderHook(() => useClients(), { wrapper });
    await waitFor(() => expect(result.current.clients).toHaveLength(1));

    await expect(result.current.remove("c1")).rejects.toThrow();

    await waitFor(() => expect(result.current.clients).toHaveLength(1));
  });
});

describe("useTemplates", () => {
  it("restores the previous value when the save fails", async () => {
    seed({ templates: [template()] });
    failNext("saveTemplate");
    const { result } = renderHook(() => useTemplates(), { wrapper });
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await expect(result.current.save(template({ name: "Renamed" }))).rejects.toThrow();

    await waitFor(() => expect(result.current.templates[0].name).toBe("Original Template"));
  });
});

describe("useInvoices", () => {
  it("restores the previous status when the save fails", async () => {
    seed({ invoices: [invoice()] });
    failNext("saveInvoice");
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.invoices).toHaveLength(1));

    await expect(result.current.save(invoice({ status: "paid" }))).rejects.toThrow();

    await waitFor(() => expect(result.current.invoices[0].status).toBe("sent"));
  });

  it("puts a deleted invoice back when the delete fails", async () => {
    seed({ invoices: [invoice()] });
    failNext("deleteInvoice");
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.invoices).toHaveLength(1));

    await expect(result.current.remove("i1")).rejects.toThrow();

    await waitFor(() => expect(result.current.invoices).toHaveLength(1));
    expect(result.current.invoices[0].invoiceNumber).toBe("OG-2026-001");
  });

  it("does not optimistically insert a created invoice under its provisional number", async () => {
    // The server allocates the number. Inserting optimistically would show a
    // number the invoice does not have, then correct it — worse than waiting.
    seed({ invoices: [invoice()] });
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.invoices).toHaveLength(1));

    const pending = result.current.create(
      invoice({ id: "i2", invoiceNumber: "OG-2026-001" })
    );

    // Still only the original while the create is in flight.
    expect(result.current.invoices).toHaveLength(1);

    await pending;
    await waitFor(() => expect(result.current.invoices).toHaveLength(2));
    // And what landed carries the number the server issued, not the one
    // handed in.
    expect(result.current.invoices.map((i) => i.invoiceNumber).sort()).toEqual([
      "OG-2026-001",
      "OG-2026-002",
    ]);
  });
});
