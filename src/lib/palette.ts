/** Brand accent colours, in the order the handoff's swatch row presents them. */
export const BRAND_PALETTE = [
  "var(--foreground)",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
] as const;

/** Deterministic palette assignment so brands without a colour still differ. */
export function paletteColorForIndex(index: number): string {
  return BRAND_PALETTE[index % BRAND_PALETTE.length];
}
