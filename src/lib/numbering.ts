import type { Brand, Invoice } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Understands every format the app has issued: legacy "SC2026001", v2
 * "SC-2026-014" and the current "SC-2026014". Older numbers are rewritten to
 * the current format by `migrate.ts` (see `compactInvoiceNumber`), but
 * imported backups may still carry them.
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
  return `${prefix}-${year}${String(seq).padStart(3, "0")}`;
}

/** Rewrites any parseable number for `prefix` into the current format; anything else is returned unchanged. */
export function compactInvoiceNumber(value: string, prefix: string): string {
  const parsed = parseInvoiceNumber(value, prefix);
  return parsed ? formatInvoiceNumber(prefix, parsed.year, parsed.seq) : value;
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
