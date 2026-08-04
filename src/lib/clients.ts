import type { Invoice } from "./types";

/**
 * The invoices a client-deletion needs to touch: every invoice whose
 * `clientId` still points at `clientId`. Left alone, each of these would
 * keep referencing a client record that no longer exists — the caller's job
 * is to null that reference out on each one returned here.
 *
 * Pure and side-effect free so the *set this cascade acts on* is pinned by a
 * unit test rather than only ever exercised indirectly through a stubbed
 * component test. Same shape of job as `brandDeleteGuard` in `brands.ts`
 * (both start from "which invoices reference this record"), but a client is
 * never blocked from deleting the way a brand is — this feeds a write loop
 * instead of a refusal.
 */
export function invoicesToUnlink(clientId: string, invoices: Invoice[]): Invoice[] {
  return invoices.filter((invoice) => invoice.clientId === clientId);
}
