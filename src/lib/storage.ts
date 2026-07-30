import { Brand, Client, Invoice } from "./types";

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";

function getItem<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

// Returns whether the write actually persisted. `localStorage.setItem` can
// throw (most commonly `QuotaExceededError`) and a full-backup restore is
// the largest write this app ever makes — the likeliest place to hit that
// limit. Callers that need to report an honest result (the importer) check
// this; existing callers that ignore the return value behave exactly as
// before.
function setItem<T>(key: string, data: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error(`Failed to persist ${key} to localStorage`, err);
    return false;
  }
}

// Brands
export function getBrands(): Brand[] {
  return getItem<Brand>(BRANDS_KEY);
}

export function getBrand(id: string): Brand | null {
  return getBrands().find((b) => b.id === id) ?? null;
}

export function saveBrand(brand: Brand): boolean {
  const brands = getBrands();
  const index = brands.findIndex((b) => b.id === brand.id);
  if (index >= 0) {
    brands[index] = brand;
  } else {
    brands.push(brand);
  }
  return setItem(BRANDS_KEY, brands);
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

export function saveClient(client: Client): boolean {
  const clients = getClients();
  const index = clients.findIndex((c) => c.id === client.id);
  if (index >= 0) {
    clients[index] = client;
  } else {
    clients.push(client);
  }
  return setItem(CLIENTS_KEY, clients);
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

export function saveInvoice(invoice: Invoice): boolean {
  const invoices = getInvoices();
  const index = invoices.findIndex((i) => i.id === invoice.id);
  if (index >= 0) {
    invoices[index] = invoice;
  } else {
    invoices.push(invoice);
  }
  return setItem(INVOICES_KEY, invoices);
}

export function deleteInvoice(id: string): boolean {
  return setItem(
    INVOICES_KEY,
    getInvoices().filter((i) => i.id !== id)
  );
}

export function getNextInvoiceNumber(brandId: string): string {
  const brand = getBrand(brandId);
  if (!brand) return "INV001";
  const prefix = brand.invoicePrefix;
  const year = new Date().getFullYear().toString();
  const yearPrefix = `${prefix}${year}`;
  const existing = getInvoices()
    .filter((i) => i.brandId === brandId && i.invoiceNumber.startsWith(yearPrefix))
    .map((i) => parseInt(i.invoiceNumber.slice(yearPrefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${yearPrefix}${next.toString().padStart(3, "0")}`;
}

