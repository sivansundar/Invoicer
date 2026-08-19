import type { Client, Invoice } from "./types";

/**
 * The five accent slots a recent-client dot may use — the design system's
 * whole categorical set, in its fixed blue → amber → violet → green order
 * with `red` last. Assignable to `Tone` in `components/ui/primitives.tsx`.
 */
export type ChipTone = "blue" | "amber" | "violet" | "green" | "red";

const CHIP_TONES: readonly ChipTone[] = ["blue", "amber", "violet", "green", "red"];

/** How many chips the form offers. Four fits one row beside the client field. */
export const RECENT_CLIENT_LIMIT = 4;

export interface RecentClient {
  /** The saved client's id — the value the "Billed to" select takes. */
  id: string;
  companyName: string;
  tone: ChipTone;
}

/** FNV-1a. Short, dependency-free, and spreads ids across all five slots. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A stable accent for a client's dot. Keyed on the id rather than the name so
 * renaming a client doesn't repaint it — the design system's rule that a
 * reader who learned "Avara Labs is amber" must not be misled later.
 */
export function toneForClient(clientId: string): ChipTone {
  return CHIP_TONES[hash(clientId) % CHIP_TONES.length];
}

/**
 * The saved clients invoiced most recently, newest first, at most `limit` of
 * them — the shortcut for the common case of billing someone you already
 * billed. Returns `[]` when there is no history to derive from, which is the
 * signal to render no chip row at all.
 *
 * "Most recent" is `createdAt`, not `billDate`, matching
 * `latestInvoiceForBrand` and the invoice table: a back-dated invoice written
 * today is still the client you most recently billed.
 *
 * Two kinds of invoice are skipped. One with `clientId: null` was typed
 * manually and has no saved record to select. One whose client has since been
 * deleted has an id nothing can be set to — a chip for it would be a dead
 * control. Names come from the live client record, not the invoice's frozen
 * snapshot, so a chip always reads the same as its option in the select.
 */
export function recentClients(
  invoices: Invoice[],
  clients: Client[],
  limit: number = RECENT_CLIENT_LIMIT
): RecentClient[] {
  const byId = new Map(clients.map((client) => [client.id, client]));
  const newestFirst = [...invoices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const seen = new Set<string>();
  const recents: RecentClient[] = [];
  for (const invoice of newestFirst) {
    const clientId = invoice.clientId;
    if (!clientId || seen.has(clientId)) continue;
    seen.add(clientId);

    const client = byId.get(clientId);
    if (!client) continue;

    recents.push({
      id: client.id,
      companyName: client.companyName,
      tone: toneForClient(client.id),
    });
    if (recents.length === limit) break;
  }
  return recents;
}
