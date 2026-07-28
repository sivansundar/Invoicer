import type { Brand, Invoice } from "./types";

/**
 * The invoice the template editor's live preview fills tokens from. Picks
 * whichever real invoice most closely resembles what a reminder is actually
 * written for: the first overdue invoice (the case a reminder email exists
 * to chase), else the first invoice that's been sent but isn't yet overdue,
 * else — with nothing unpaid at all — the very first invoice regardless of
 * status, so a user with only a draft still sees their own data reflected
 * rather than an arbitrarily "better" fake one. `null` only when there are
 * no invoices whatsoever (e.g. a brand-new account before the first invoice
 * is created); the caller renders the raw, unfilled template in that case
 * instead of crashing on a missing invoice.
 *
 * `find`, not `filter()[0]` — deliberately array-order dependent (never
 * sorts), matching the "don't sort by createdAt" rule the rest of this
 * feature already follows, so the pick is stable and doesn't depend on
 * which invoice a caller happens to add most recently.
 */
export function sampleInvoiceForPreview(invoices: Invoice[]): Invoice | null {
  const overdue = invoices.find((invoice) => invoice.status === "overdue");
  if (overdue) return overdue;

  const sent = invoices.find((invoice) => invoice.status === "sent");
  if (sent) return sent;

  return invoices[0] ?? null;
}

/**
 * The brands currently pointing their follow-up schedule at `templateId`,
 * by name. Feeds both the editor's "Used by" subtitle and the delete guard
 * that blocks removing a template a brand still depends on — deleting it
 * out from under a brand would leave that brand's `followup.templateId`
 * dangling (the `NativeSelect` in `brand-followup-card.tsx` would have no
 * matching option to show, and every future reminder for that brand would
 * silently have no template to read).
 */
export function templateBrandNames(templateId: string, brands: Brand[]): string[] {
  return brands
    .filter((brand) => brand.followup.templateId === templateId)
    .map((brand) => brand.name);
}
