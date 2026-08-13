import { vi } from "vitest";
import type { Brand, Client, EmailTemplate, Invoice, PlanState } from "@/lib/types";
import { formatInvoiceNumber, parseInvoiceNumber } from "@/lib/numbering";

/**
 * An in-memory stand-in for `@/lib/storage`, for unit tests.
 *
 * Chosen over MSW (ruled 2026-08-12, see the Phase 2 plan). MSW would mean
 * hand-writing a PostgREST emulator — filter syntax, embedded selects,
 * `Prefer` headers, RPC endpoints, `23505`/`42501`/`PGRST204` envelopes —
 * whose fidelity is capped by the author's model of PostgREST, and a handler
 * returning a shape PostgREST would not produce gives false confidence.
 *
 * What this fake skips is covered better elsewhere: the mappers have their
 * own unit tests, and `storage.ts` itself is exercised against real Postgres
 * by the integration suite. What component tests actually need from storage
 * is a place to put fixtures and a way to make a write fail, which is all
 * this provides.
 *
 * `fake-seam.test.ts` asserts this exports exactly what the real module
 * does, so it cannot silently drift.
 */

interface FakeState {
  brands: Brand[];
  clients: Client[];
  templates: EmailTemplate[];
  invoices: Invoice[];
  plan: PlanState;
}

const EMPTY_PLAN: PlanState = { tier: "free", renewsOn: null };

const state: FakeState = {
  brands: [],
  clients: [],
  templates: [],
  invoices: [],
  plan: { ...EMPTY_PLAN },
};

/**
 * Set to make the next matching call reject. Tests that assert failure
 * handling ("the form must not navigate away when the save fails") set this
 * rather than reaching for a spy on an internal.
 */
const failures = new Map<string, { message: string; onCall: number }>();
const callCounts = new Map<string, number>();

export function failNext(fn: string, message = "write failed"): void {
  failures.set(fn, { message, onCall: (callCounts.get(fn) ?? 0) + 1 });
}

/**
 * Fail the nth call to `fn` (1-based), letting the ones before and after it
 * through. For the partial-failure paths: a cascade that writes five records
 * and fails on the third has to report the shortfall rather than claim
 * success, and that is only testable if one write in the middle can fail.
 */
export function failOnCall(fn: string, callNumber: number, message = "write failed"): void {
  failures.set(fn, { message, onCall: callNumber });
}

/** Returns whether this call is the armed one, consuming the arming if so. */
function shouldFail(fn: string): string | null {
  const count = (callCounts.get(fn) ?? 0) + 1;
  callCounts.set(fn, count);

  const armed = failures.get(fn);
  if (!armed || armed.onCall !== count) return null;
  failures.delete(fn);
  return armed.message;
}

function maybeFail(fn: string): void {
  const message = shouldFail(fn);
  if (message) throw new Error(message);
}

/** Wipes every collection, call counter and armed failure. Call in `beforeEach`. */
export function resetFakeSeam(): void {
  state.brands = [];
  state.clients = [];
  state.templates = [];
  state.invoices = [];
  state.plan = { ...EMPTY_PLAN };
  failures.clear();
  callCounts.clear();
}

/** Seeds a collection directly, without going through the async save path. */
export function seed(data: Partial<Omit<FakeState, "plan">>): void {
  if (data.brands) state.brands = [...data.brands];
  if (data.clients) state.clients = [...data.clients];
  if (data.templates) state.templates = [...data.templates];
  if (data.invoices) state.invoices = [...data.invoices];
}

function upsert<T extends { id: string }>(collection: T[], item: T): T {
  const index = collection.findIndex((existing) => existing.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.push(item);
  return item;
}

// Brands — async, matching the real seam
export const getBrands = vi.fn(async (): Promise<Brand[]> => {
  maybeFail("getBrands");
  return [...state.brands];
});

export const getBrand = vi.fn(async (id: string): Promise<Brand | null> => {
  maybeFail("getBrand");
  return state.brands.find((b) => b.id === id) ?? null;
});

export const saveBrand = vi.fn(async (brand: Brand): Promise<Brand> => {
  maybeFail("saveBrand");
  // Mirrors the real seam's non-atomic, two-write ordering (see the doc
  // comment on `saveBrand` in `@/lib/storage.ts`): the whole row — a fresh
  // data URL included, verbatim — commits FIRST, before the upload is even
  // attempted. Only once that row exists does the upload run, followed by a
  // second write that swaps the base64 for the path. A `uploadBrandLogo`
  // failure after this point therefore leaves the row committed with its
  // base64 intact, exactly like a caller of the real seam would see —
  // upserting only after a successful upload (an earlier version of this
  // fake) would instead lose the row entirely on that failure, which the
  // real seam never does.
  let result = upsert(state.brands, brand);
  if (brand.logo?.startsWith("data:")) {
    const logoPath = await uploadBrandLogo(brand.id, brand.logo);
    result = upsert(state.brands, { ...brand, logoPath, logo: undefined });
  }
  return result;
});

export const deleteBrand = vi.fn(async (id: string): Promise<void> => {
  maybeFail("deleteBrand");
  state.brands = state.brands.filter((b) => b.id !== id);
});

export const LOGO_URL_TTL_SECONDS = 3600;

export const uploadBrandLogo = vi.fn(async (brandId: string, dataUrl: string): Promise<string> => {
  maybeFail("uploadBrandLogo");
  // Deterministic but not a real digest — component tests care that a path
  // is produced and threaded through, not that it hashes correctly. The real
  // hashing has its own unit tests in `logo-storage.test.ts`.
  return `${brandId}/${dataUrl.length}.png`;
});

export const getLogoUrl = vi.fn(async (path: string): Promise<string> => {
  maybeFail("getLogoUrl");
  return `https://signed.test/${path}`;
});

// Clients
export const getClients = vi.fn(async (): Promise<Client[]> => {
  maybeFail("getClients");
  return [...state.clients];
});

export const getClient = vi.fn(async (id: string): Promise<Client | null> => {
  maybeFail("getClient");
  return state.clients.find((c) => c.id === id) ?? null;
});

export const saveClient = vi.fn(async (client: Client): Promise<Client> => {
  maybeFail("saveClient");
  return upsert(state.clients, client);
});

export const deleteClient = vi.fn(async (id: string): Promise<void> => {
  maybeFail("deleteClient");
  state.clients = state.clients.filter((c) => c.id !== id);
});

// Templates
export const getTemplates = vi.fn(async (): Promise<EmailTemplate[]> => {
  maybeFail("getTemplates");
  return [...state.templates];
});

export const saveTemplate = vi.fn(async (template: EmailTemplate): Promise<EmailTemplate> => {
  maybeFail("saveTemplate");
  return upsert(state.templates, template);
});

export const deleteTemplate = vi.fn(async (id: string): Promise<void> => {
  maybeFail("deleteTemplate");
  state.templates = state.templates.filter((t) => t.id !== id);
});

// Invoices
export const getInvoices = vi.fn(async (): Promise<Invoice[]> => {
  maybeFail("getInvoices");
  return [...state.invoices];
});

export const getInvoice = vi.fn(async (id: string): Promise<Invoice | null> => {
  maybeFail("getInvoice");
  return state.invoices.find((i) => i.id === id) ?? null;
});

/**
 * Mirrors the server allocating the number: unless the caller is preserving
 * one (a restore), the issued number is the next in sequence for the brand,
 * which is NOT necessarily the provisional one the form supplied. Tests that
 * assert the UI reports the server's answer depend on these differing.
 */
export const createInvoice = vi.fn(
  async (invoice: Invoice, options: { preserveNumber?: boolean } = {}): Promise<Invoice> => {
    maybeFail("createInvoice");

    if (options.preserveNumber) {
      return upsert(state.invoices, invoice);
    }

    const prefix = invoice.brandSnapshot.invoicePrefix;
    const year = Number(invoice.billDate.slice(0, 4));
    const taken = state.invoices
      .filter((i) => i.brandId === invoice.brandId)
      .map((i) => parseInvoiceNumber(i.invoiceNumber, prefix))
      .filter((p): p is { year: number; seq: number } => p !== null && p.year === year)
      .map((p) => p.seq);
    const seq = taken.length > 0 ? Math.max(...taken) + 1 : 1;

    return upsert(state.invoices, {
      ...invoice,
      invoiceNumber: formatInvoiceNumber(prefix, year, seq),
    });
  }
);

export const saveInvoice = vi.fn(async (invoice: Invoice): Promise<Invoice> => {
  maybeFail("saveInvoice");
  const existing = state.invoices.find((i) => i.id === invoice.id);
  if (!existing) throw new Error("invoice not found");
  // Never reallocates a number, matching update_invoice.
  return upsert(state.invoices, { ...invoice, invoiceNumber: existing.invoiceNumber });
});

export const deleteInvoice = vi.fn(async (id: string): Promise<void> => {
  maybeFail("deleteInvoice");
  state.invoices = state.invoices.filter((i) => i.id !== id);
});

// Plan state stays local and synchronous by design — it is a mock with no
// schema behind it. See the Phase 2 plan, Decisions §2.
export const getPlanSnapshot = vi.fn((): PlanState => state.plan);

export const savePlan = vi.fn((plan: PlanState): boolean => {
  if (shouldFail("savePlan")) return false;
  state.plan = plan;
  return true;
});

// Kept so the fake matches the real module's exports. `subscribe` now
// serves only plan state, the last thing still in localStorage.
export const subscribe = vi.fn((listener: () => void) => {
  void listener;
  return () => {};
});

export { nextInvoiceNumber } from "@/lib/numbering";
