import { effectiveStatus } from "./dashboard";
import type { Brand, Client, Invoice, InvoiceStatus } from "./types";
import { formatCurrency } from "./utils";

export type CommandGroupKey = "actions" | "invoices" | "clients" | "brands";

export interface CommandItem {
  /** Unique across every group — the dialog uses it as React key and as the
   *  id the input points `aria-activedescendant` at. */
  id: string;
  group: CommandGroupKey;
  label: string;
  /** Second line — the client on an invoice, the contact on a client. */
  sub?: string;
  /** Right-hand figure, already formatted in the invoice's own currency.
   *  Nothing here ever adds two invoices together, so no currency is ever
   *  summed across another. */
  amount?: string;
  status?: InvoiceStatus;
  href: string;
}

export interface CommandGroup {
  key: CommandGroupKey;
  label: string;
  items: CommandItem[];
  /**
   * How many records matched before the cap. When this exceeds
   * `items.length` the dialog says so — a silently truncated list looks like
   * a complete answer to a question it did not answer.
   */
  matched: number;
}

/** The shape of `FEATURES` this module needs, so tests can pass flags off. */
export interface CommandFeatureFlags {
  readonly billing: boolean;
  readonly followups: boolean;
}

/** Per group, not per dialog — five of each keeps the whole list on screen. */
export const MAX_PER_GROUP = 5;

const SCORE = {
  exact: 100,
  prefix: 75,
  word: 50,
  substring: 25,
} as const;

/**
 * How well `text` answers `query`, higher being better, `null` for no match.
 * Four bands rather than a fuzzy distance: an invoice number or a company
 * name is something the user is recalling, not approximating, so "starts
 * with" beating "contains somewhere" is the whole of the ranking they need.
 *
 * An empty query returns `null`. The palette's no-query state shows recent
 * invoices, which is a different question from "what matches nothing".
 */
export function scoreMatch(text: string, query: string): number | null {
  const haystack = text.trim().toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle || !haystack) return null;

  if (haystack === needle) return SCORE.exact;
  if (haystack.startsWith(needle)) return SCORE.prefix;
  if (haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle))) return SCORE.word;
  if (haystack.includes(needle)) return SCORE.substring;
  return null;
}

/** Best score across several fields, or `null` when none of them match. */
function bestScore(scores: (number | null)[]): number | null {
  let best: number | null = null;
  for (const score of scores) {
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

interface Scored<T> {
  item: T;
  score: number;
}

/**
 * Sorts by score, then by the caller's own tiebreak, then by insertion order
 * so the list never reshuffles between renders of the same data.
 */
function rank<T>(scored: Scored<T>[], tiebreak: (a: T, b: T) => number): T[] {
  return scored
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.score - a.score || tiebreak(a.item, b.item) || a.index - b.index)
    .map((entry) => entry.item);
}

function cap(items: CommandItem[], key: CommandGroupKey, label: string, limit: number): CommandGroup {
  return { key, label, items: items.slice(0, limit), matched: items.length };
}

interface ActionSpec {
  id: string;
  label: string;
  sub: string;
  href: string;
  flag?: keyof CommandFeatureFlags;
}

/**
 * The fixed destinations. Flags are honoured exactly as `navGroups` honours
 * them in the sidebar: a screen the flag hides is not reachable from here
 * either, or the palette becomes a back door into a feature that is off.
 */
const ACTIONS: ActionSpec[] = [
  { id: "new-invoice", label: "New invoice", sub: "Create", href: "/invoices/create" },
  { id: "new-client", label: "New client", sub: "Create", href: "/clients/create" },
  { id: "new-brand", label: "New brand", sub: "Create", href: "/brands/create" },
  { id: "dashboard", label: "Dashboard", sub: "Go to", href: "/dashboard" },
  { id: "reports", label: "Reports", sub: "Go to", href: "/reports" },
  { id: "followups", label: "Follow-ups", sub: "Go to", href: "/followups", flag: "followups" },
];

function actionItem(spec: ActionSpec): CommandItem {
  return { id: `action:${spec.id}`, group: "actions", label: spec.label, sub: spec.sub, href: spec.href };
}

/**
 * Every action the flags allow, unfiltered. This is the no-query list: the
 * palette opens on what you can do, not on an empty pane.
 */
export function commandActions(features: CommandFeatureFlags): CommandItem[] {
  return ACTIONS.filter((spec) => !spec.flag || features[spec.flag]).map(actionItem);
}

/**
 * Actions are matched on their label like everything else rather than being
 * pinned to the top of every result set. Leaving "New brand" sitting above a
 * search for a client name would make the group noise, and it would also mean
 * a query that genuinely finds nothing could never say so.
 */
export function searchActions(features: CommandFeatureFlags, query: string): CommandItem[] {
  const scored: Scored<ActionSpec>[] = [];
  for (const spec of ACTIONS) {
    if (spec.flag && !features[spec.flag]) continue;
    const score = scoreMatch(spec.label, query);
    if (score !== null) scored.push({ item: spec, score });
  }
  return rank(scored, () => 0).map(actionItem);
}

function invoiceItem(invoice: Invoice, today: Date): CommandItem {
  return {
    id: `invoice:${invoice.id}`,
    group: "invoices",
    label: invoice.invoiceNumber,
    sub: invoice.client.companyName,
    amount: formatCurrency(invoice.total, invoice.currency ?? "INR"),
    status: effectiveStatus(invoice, today),
    href: `/invoices/${invoice.id}`,
  };
}

/** Newest first, by the same `createdAt` the invoice list sorts on. */
function byNewest(a: Invoice, b: Invoice): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Invoice number and client company name, the two things anyone actually
 * remembers about an invoice. A number match outranks a client match at the
 * same band, since typing "INV-014" is a request for one specific record
 * while typing a company name is a request for a shortlist.
 */
export function searchInvoices(invoices: Invoice[], query: string, today: Date = new Date()): CommandItem[] {
  const scored: Scored<Invoice>[] = [];
  for (const invoice of invoices) {
    const score = bestScore([
      scoreMatch(invoice.invoiceNumber, query),
      demote(scoreMatch(invoice.client.companyName, query)),
    ]);
    if (score !== null) scored.push({ item: invoice, score });
  }
  return rank(scored, byNewest).map((invoice) => invoiceItem(invoice, today));
}

/** One notch below the same band on the invoice number. */
function demote(score: number | null): number | null {
  return score === null ? null : score - 5;
}

/** The most recent invoices, for the state where nothing has been typed. */
export function recentInvoices(invoices: Invoice[], today: Date = new Date()): CommandItem[] {
  return [...invoices].sort(byNewest).map((invoice) => invoiceItem(invoice, today));
}

/**
 * Clients carry both a company name and an optional contact name; both are
 * searched, because which one a person remembers depends on who they deal
 * with. The row is titled by company, which is what invoices are addressed to.
 */
export function searchClients(clients: Client[], query: string): CommandItem[] {
  const scored: Scored<Client>[] = [];
  for (const client of clients) {
    const score = bestScore([
      scoreMatch(client.companyName, query),
      demote(client.name ? scoreMatch(client.name, query) : null),
    ]);
    if (score !== null) scored.push({ item: client, score });
  }
  return rank(scored, (a, b) => a.companyName.localeCompare(b.companyName)).map((client) => ({
    id: `client:${client.id}`,
    group: "clients" as const,
    label: client.companyName,
    sub: client.name || client.email,
    href: `/clients/${client.id}/edit`,
  }));
}

export function searchBrands(brands: Brand[], query: string): CommandItem[] {
  const scored: Scored<Brand>[] = [];
  for (const brand of brands) {
    const score = scoreMatch(brand.name, query);
    if (score !== null) scored.push({ item: brand, score });
  }
  return rank(scored, (a, b) => a.name.localeCompare(b.name)).map((brand) => ({
    id: `brand:${brand.id}`,
    group: "brands" as const,
    label: brand.name,
    sub: brand.invoicePrefix ? `${brand.invoicePrefix} numbering` : undefined,
    href: `/brands/${brand.id}/edit`,
  }));
}

export interface CommandSearchInput {
  query: string;
  invoices: Invoice[];
  clients: Client[];
  brands: Brand[];
  features: CommandFeatureFlags;
  /** Threaded through for deterministic tests — `effectiveStatus` ages an
   *  unpaid invoice into "overdue" against today's date. */
  today?: Date;
  limit?: number;
}

/**
 * Everything the dialog renders, in the order it renders it. Groups that
 * matched nothing are dropped rather than shown empty, so an empty result
 * set is one honest sentence instead of four empty headings.
 *
 * With no query this is the actions plus the most recent invoices: the two
 * things that are true before the user has told us anything.
 */
export function buildCommandGroups({
  query,
  invoices,
  clients,
  brands,
  features,
  today = new Date(),
  limit = MAX_PER_GROUP,
}: CommandSearchInput): CommandGroup[] {
  const trimmed = query.trim();

  const groups: CommandGroup[] = trimmed
    ? [
        cap(searchActions(features, trimmed), "actions", "Actions", limit),
        cap(searchInvoices(invoices, trimmed, today), "invoices", "Invoices", limit),
        cap(searchClients(clients, trimmed), "clients", "Clients", limit),
        cap(searchBrands(brands, trimmed), "brands", "Brands", limit),
      ]
    : [
        // Not capped by `matched`: the action list is short and complete, so
        // there is nothing being held back to warn about.
        { key: "actions", label: "Actions", items: commandActions(features), matched: 0 },
        cap(recentInvoices(invoices, today), "invoices", "Recent invoices", limit),
      ];

  return groups.filter((group) => group.items.length > 0);
}

/** Flattened in render order — what arrow keys walk and Enter opens. */
export function flattenGroups(groups: CommandGroup[]): CommandItem[] {
  return groups.flatMap((group) => group.items);
}

/** `null` when nothing was held back. */
export function capNote(group: CommandGroup): string | null {
  if (group.matched <= group.items.length) return null;
  return `Showing ${group.items.length} of ${group.matched} — type to narrow the list`;
}

/**
 * The count in the dialog's footer. It names the total whenever the caps are
 * holding rows back: a footer reading "5 results" over a list that matched
 * eight would be the same silent truncation the per-group note exists to
 * avoid, just one line further down.
 */
export function resultSummary(groups: CommandGroup[]): string {
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const matched = groups.reduce(
    (sum, group) => sum + Math.max(group.matched, group.items.length),
    0
  );
  if (matched > shown) return `${shown} of ${matched} results`;
  return shown === 1 ? "1 result" : `${shown} results`;
}
