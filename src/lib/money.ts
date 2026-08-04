import type { Currency, Invoice } from "./types";
import { formatCurrency } from "./utils";

const CURRENCY_ORDER: Currency[] = ["INR", "USD", "SGD"];

export interface CurrencyGroup {
  currency: Currency;
  total: number;
}

/**
 * Currencies are never summed together — the app shows them side by side.
 */
export function groupTotalsByCurrency(invoices: Invoice[]): CurrencyGroup[] {
  const totals = new Map<Currency, number>();
  for (const invoice of invoices) {
    const currency = invoice.currency ?? "INR";
    totals.set(currency, (totals.get(currency) ?? 0) + invoice.total);
  }
  return CURRENCY_ORDER.filter((c) => totals.has(c)).map((currency) => ({
    currency,
    total: totals.get(currency)!,
  }));
}

export function formatCurrencyGroups(groups: CurrencyGroup[]): string {
  if (groups.length === 0) return formatCurrency(0, "INR");
  return groups.map((g) => formatCurrency(g.total, g.currency)).join(" + ");
}

/** Secondary line for stat cards when more than one currency is in play. */
export function overflowSummary(groups: CurrencyGroup[]): string {
  if (groups.length <= 1) return "";
  const rest = groups.slice(1).map((g) => formatCurrency(g.total, g.currency));
  return `Includes ${rest.join(" + ")}`;
}
