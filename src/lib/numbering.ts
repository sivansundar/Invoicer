import type { Brand, Invoice } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Understands both the legacy hyphen-free format ("SC2026001") and the v2
 * format ("SC-2026-014"). Legacy numbers are never rewritten, so both shapes
 * coexist and both must be considered when picking the next sequence.
 */
export function parseInvoiceNumber(
  value: string,
  prefix: string
): { year: number; seq: number } | null {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-?(\\d{4})-?(\\d+)$`);
  const match = pattern.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
}

export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

export function nextInvoiceNumber(
  brand: Brand,
  invoices: Invoice[],
  year: number = new Date().getFullYear()
): string {
  const sequences = invoices
    .filter((i) => i.brandId === brand.id)
    .map((i) => parseInvoiceNumber(i.invoiceNumber, brand.invoicePrefix))
    .filter((p): p is { year: number; seq: number } => p !== null && p.year === year)
    .map((p) => p.seq);

  const next = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  return formatInvoiceNumber(brand.invoicePrefix, year, next);
}
