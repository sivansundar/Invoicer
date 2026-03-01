import { Brand, Client, Invoice } from "./types";

const BRANDS_KEY = "invoicer_brands";
const CLIENTS_KEY = "invoicer_clients";
const INVOICES_KEY = "invoicer_invoices";

function getItem<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setItem<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
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

export function getNextInvoiceNumber(brandId: string): string {
  const brand = getBrand(brandId);
  if (!brand) return "INV-001";
  const num = brand.nextInvoiceNumber.toString().padStart(3, "0");
  return `${brand.invoicePrefix}-${num}`;
}

export function incrementInvoiceNumber(brandId: string): void {
  const brand = getBrand(brandId);
  if (!brand) return;
  brand.nextInvoiceNumber += 1;
  saveBrand(brand);
}
