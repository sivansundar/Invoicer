import { Brand, Client, EmailTemplate, Invoice, PlanState } from "./types";
import { runMigration } from "./migrate";

export { nextInvoiceNumber } from "./numbering";
export { runMigration };

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";
const TEMPLATES_KEY = "invoicer_templates";
const PLAN_KEY = "invoicer_plan";

function getItem<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setItem<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
  invalidate(key);
}

type Listener = () => void;
const listeners = new Set<Listener>();

function handleStorageEvent(): void {
  snapshots.clear();
  notify();
}

/**
 * Subscribe to local mutations and to writes from other tabs.
 *
 * The "storage" window event is only ever dispatched by other tabs/windows
 * (same-tab writes never fire it), so it is wired through a single shared
 * handler rather than the per-call `listener` reference — that handler
 * clears the snapshot cache before rebroadcasting to every subscriber, and
 * is attached/removed exactly once regardless of how many hooks subscribe.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("storage", handleStorageEvent);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const EMPTY: never[] = [];
const snapshots = new Map<string, unknown[]>();

function getSnapshot<T>(key: string): T[] {
  if (!snapshots.has(key)) {
    snapshots.set(key, typeof window === "undefined" ? EMPTY : getItem<T>(key));
  }
  return snapshots.get(key) as T[];
}

function invalidate(key: string): void {
  snapshots.delete(key);
  notify();
}

export function getBrandsSnapshot(): Brand[] {
  return getSnapshot<Brand>(BRANDS_KEY);
}

export function getClientsSnapshot(): Client[] {
  return getSnapshot<Client>(CLIENTS_KEY);
}

export function getInvoicesSnapshot(): Invoice[] {
  return getSnapshot<Invoice>(INVOICES_KEY);
}

export function getTemplatesSnapshot(): EmailTemplate[] {
  return getSnapshot<EmailTemplate>(TEMPLATES_KEY);
}

// Brands
export function getBrands(): Brand[] {
  return getItem<Brand>(BRANDS_KEY);
}

export function getBrand(id: string): Brand | null {
  return getBrands().find((b) => b.id === id) ?? null;
}

export function saveBrand(brand: Brand): void {
  const brands = getBrands();
  const index = brands.findIndex((b) => b.id === brand.id);
  if (index >= 0) {
    brands[index] = brand;
  } else {
    brands.push(brand);
  }
  setItem(BRANDS_KEY, brands);
}

export function deleteBrand(id: string): void {
  setItem(
    BRANDS_KEY,
    getBrands().filter((b) => b.id !== id)
  );
}

// Clients
export function getClients(): Client[] {
  return getItem<Client>(CLIENTS_KEY);
}

export function getClient(id: string): Client | null {
  return getClients().find((c) => c.id === id) ?? null;
}

export function saveClient(client: Client): void {
  const clients = getClients();
  const index = clients.findIndex((c) => c.id === client.id);
  if (index >= 0) {
    clients[index] = client;
  } else {
    clients.push(client);
  }
  setItem(CLIENTS_KEY, clients);
}

export function deleteClient(id: string): void {
  setItem(
    CLIENTS_KEY,
    getClients().filter((c) => c.id !== id)
  );
}

// Invoices
export function getInvoices(): Invoice[] {
  return getItem<Invoice>(INVOICES_KEY);
}

export function getInvoice(id: string): Invoice | null {
  return getInvoices().find((i) => i.id === id) ?? null;
}

export function saveInvoice(invoice: Invoice): void {
  const invoices = getInvoices();
  const index = invoices.findIndex((i) => i.id === invoice.id);
  if (index >= 0) {
    invoices[index] = invoice;
  } else {
    invoices.push(invoice);
  }
  setItem(INVOICES_KEY, invoices);
}

export function deleteInvoice(id: string): void {
  setItem(
    INVOICES_KEY,
    getInvoices().filter((i) => i.id !== id)
  );
}

// Templates
export function getTemplates(): EmailTemplate[] {
  return getItem<EmailTemplate>(TEMPLATES_KEY);
}

export function getTemplate(id: string): EmailTemplate | null {
  return getTemplates().find((t) => t.id === id) ?? null;
}

export function saveTemplate(template: EmailTemplate): void {
  const templates = getTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  setItem(TEMPLATES_KEY, templates);
}

export function deleteTemplate(id: string): void {
  setItem(
    TEMPLATES_KEY,
    getTemplates().filter((t) => t.id !== id)
  );
}

// MOCK: plan state is local-only. There is no billing integration.
export function getPlan(): PlanState {
  if (typeof window === "undefined") return { tier: "free", renewsOn: null };
  const raw = localStorage.getItem(PLAN_KEY);
  if (!raw) return { tier: "free", renewsOn: null };
  try {
    return JSON.parse(raw) as PlanState;
  } catch {
    return { tier: "free", renewsOn: null };
  }
}

export function savePlan(plan: PlanState): void {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

