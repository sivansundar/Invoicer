import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Currency } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_CONFIG: Record<Currency, { locale: string; decimals: number; symbol: string }> = {
  INR: { locale: "en-IN", decimals: 0, symbol: "₹" },
  USD: { locale: "en-US", decimals: 2, symbol: "$" },
  SGD: { locale: "en-SG", decimals: 2, symbol: "S$" },
}

export function formatCurrency(n: number, currency: Currency, minDecimals?: number) {
  const config = CURRENCY_CONFIG[currency]
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minDecimals ?? config.decimals,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatCurrencyLabel(n: number, currency: Currency) {
  const config = CURRENCY_CONFIG[currency]
  const num = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `${config.symbol}${num}`
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_CONFIG[currency].symbol
}

export function formatCurrencyAmount(n: number, currency: Currency): string {
  const config = CURRENCY_CONFIG[currency]
  return new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
