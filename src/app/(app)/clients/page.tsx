"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPageSkeleton } from "@/components/ui/page-skeletons";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import { avgDaysToPay, effectiveStatus } from "@/lib/dashboard";
import { dominantCurrency, filterInvoices, fyLabel } from "@/lib/reports";
import {
  LetterTile,
  MetricCard,
  Panel,
  SectionLabel,
  TickBar,
  TwoLineCell,
} from "@/components/ui/primitives";
import { Crown, Hourglass, Plus, Search, ShieldCheck, Users } from "lucide-react";
import type { Client, Currency, Invoice, InvoiceStatus } from "@/lib/types";

export default function ClientsPage() {
  return <ClientsPageContent />;
}

function ClientsPageContent() {
  const { clients, loading } = useClients();
  const { invoices } = useInvoices();
  const [query, setQuery] = useState("");

  // The cards describe the account, so they always read the full client list —
  // the search below filters the table, not the summary.
  const summary = useMemo(() => summarize(clients, invoices), [clients, invoices]);
  const filtered = useMemo(() => matchClients(clients, query), [clients, query]);

  // Guarded before the "No clients yet" branch below — that copy is a
  // statement about the account, and showing it mid-fetch tells a user with
  // fifty clients that they have none.
  if (loading) return <ListPageSkeleton />;

  return (
    <div className="flex max-w-[1100px] flex-col gap-5 p-8">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-[560px] text-[14.5px] text-ink-2">
          Saved once, auto-filled on every invoice.
        </p>
        <Button asChild className="gap-1.5">
          <Link href="/clients/create">
            <Plus className="size-4" />
            New client
          </Link>
        </Button>
      </div>

      {/* With no clients saved there is nothing to summarise, and four dashes
          above an empty state is noise rather than honesty. */}
      {clients.length > 0 && <SummaryCards summary={summary} />}

      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-4">
          <SectionLabel>All clients</SectionLabel>
          {clients.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients…"
                aria-label="Search clients by company, contact or email"
                className="h-9 w-[230px] rounded-[10px] bg-surface pl-9"
              />
            </div>
          )}
        </div>

        <Panel className="overflow-hidden">
          <div className="flex items-center gap-4 border-b px-5 py-3 text-[12.5px] font-medium text-ink-3">
            <div className="flex-[1.8]">Client</div>
            <div className="flex-[1.3]">Email</div>
            <div className="flex-1">Invoices</div>
            <div className="flex-[1.2]">Billed</div>
            <div className="flex-1">Avg days to pay</div>
          </div>

          {clients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium">No clients yet</p>
              <p className="mt-1 text-sm text-ink-2">
                Add one to fill it in automatically on every invoice.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium">Nothing matches that search</p>
              <p className="mt-1 text-sm text-ink-2">
                No company, contact or email contains “{query.trim()}”.
              </p>
            </div>
          ) : (
            filtered.map((client) => (
              <ClientRow key={client.id} client={client} invoices={invoices} />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ search */

/** Company name, contact name and email — the three things you'd type. */
function matchClients(clients: Client[], query: string): Client[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return clients;
  return clients.filter((client) =>
    [client.companyName, client.name, client.email].some((field) =>
      (field ?? "").toLowerCase().includes(needle)
    )
  );
}

/* ----------------------------------------------------------------- summary */

interface NamedShare {
  name: string;
  pct: number;
  currency: Currency;
}

interface NamedDays {
  name: string;
  days: number;
}

interface ClientsSummary {
  /** Every client record on the account — the baseline card one compares to. */
  saved: number;
  /** Clients with at least one issued invoice dated in the current FY. */
  billedThisFy: number;
  fy: string;
  largest: NamedShare | null;
  /** Why `largest` is absent, shown in its place. */
  largestNote: string;
  slowest: NamedDays | null;
  /** How many clients have a measurable days-to-pay at all. */
  measured: number;
  /** Clients with at least one issued invoice, ever — the "never late" pool. */
  everBilled: number;
  neverLate: number;
}

/** A draft was never billed, so nothing here counts one. */
const ISSUED_STATUSES: InvoiceStatus[] = ["sent", "paid", "overdue"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The financial year runs April → March (see lib/reports.ts, which names a FY
 * by its starting calendar year). Derived from today rather than from the most
 * recent FY present in the data: "billed this year" has to mean the year we are
 * actually in, even when that answer is zero.
 */
function currentFyStartYear(today: Date): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

/**
 * Whether an invoice was ever *observed* late: it reads as overdue right now,
 * or it was paid after its due date.
 *
 * A paid invoice with no `paidOn` (paid before that field existed — see the
 * field's doc, it is never backfilled) cannot be judged either way, so it does
 * not make a client late. That is the same choice `avgDaysToPay` makes about
 * the same missing field: exclude rather than guess.
 */
function wasEverLate(invoice: Invoice, today: Date): boolean {
  if (effectiveStatus(invoice, today) === "overdue") return true;
  if (invoice.status !== "paid" || !invoice.paidOn) return false;
  if (!ISO_DATE.test(invoice.paidOn) || !ISO_DATE.test(invoice.dueDate)) return false;
  // Both are "yyyy-MM-dd", so a string compare is a date compare.
  return invoice.paidOn > invoice.dueDate;
}

function summarize(
  clients: Client[],
  invoices: Invoice[],
  today: Date = new Date()
): ClientsSummary {
  const issued = invoices.filter((invoice) => invoice.status !== "draft");
  const startYear = currentFyStartYear(today);

  // Reuses the reports filter so this screen and the FY report agree on which
  // invoices belong to a financial year (April → March, whole year).
  const thisFy = filterInvoices(
    invoices,
    { startYear, fromMonth: 3, toMonth: 2, statuses: ISSUED_STATUSES, brandId: null },
    today
  );
  const billedIds = new Set(
    thisFy.map((invoice) => invoice.clientId).filter((id): id is string => id !== null)
  );

  /**
   * Currency decision: totals are never summed across currencies, so "who is
   * the largest client" is only answerable *inside* one currency. The card
   * ranks within the dominant currency — the one carrying the most issued
   * invoices — and names that currency in its sub-line, rather than pretending
   * ₹800,000 and $8,000 sit on one scale. Ties fall to INR → USD → SGD, the
   * app's canonical order, so the answer is stable.
   */
  const dominant = dominantCurrency(issued);

  let largest: NamedShare | null = null;
  let largestNote = "nothing issued yet";
  if (dominant) {
    const inCurrency = issued.filter((invoice) => (invoice.currency ?? "INR") === dominant);
    // Single-currency by construction, so this group total is a real total.
    const currencyTotal = groupTotalsByCurrency(inCurrency)[0]?.total ?? 0;

    let best: { name: string; total: number } | null = null;
    for (const client of clients) {
      const own = inCurrency.filter((invoice) => invoice.clientId === client.id);
      if (own.length === 0) continue;
      const total = groupTotalsByCurrency(own)[0]?.total ?? 0;
      if (best === null || total > best.total) best = { name: client.companyName, total };
    }

    if (best === null) {
      largestNote = "no invoice links to a saved client";
    } else if (currencyTotal <= 0) {
      largestNote = `${dominant} issued totals are zero`;
    } else {
      largest = {
        name: best.name,
        // Share of everything issued in that currency, including invoices not
        // linked to a saved client — that is the real denominator.
        pct: Math.round((best.total / currencyTotal) * 100),
        currency: dominant,
      };
    }
  }

  let slowest: NamedDays | null = null;
  let measured = 0;
  for (const client of clients) {
    const days = avgDaysToPay(invoices.filter((invoice) => invoice.clientId === client.id));
    if (days === null) continue;
    measured += 1;
    if (slowest === null || days > slowest.days) slowest = { name: client.companyName, days };
  }

  const everBilledClients = clients.filter((client) =>
    issued.some((invoice) => invoice.clientId === client.id)
  );
  const neverLate = everBilledClients.filter(
    (client) =>
      !issued.some((invoice) => invoice.clientId === client.id && wasEverLate(invoice, today))
  ).length;

  return {
    saved: clients.length,
    billedThisFy: clients.filter((client) => billedIds.has(client.id)).length,
    fy: fyLabel(startYear),
    largest,
    largestNote,
    slowest,
    measured,
    everBilled: everBilledClients.length,
    neverLate,
  };
}

/* ------------------------------------------------------------------- cards */

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function pluralClients(n: number): string {
  return n === 1 ? "1 client" : `${n} clients`;
}

/** A named client in a metric card's delta slot — the identity behind the number. */
function ClientChip({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Client tiles are blue everywhere on this screen, including the table
          rows — the colour is identity, not a judgement about the number. */}
      <LetterTile letter={initial(name)} tone="blue" size={22} />
      <span className="truncate text-[13px] font-medium">{name}</span>
    </span>
  );
}

function SummaryCards({ summary }: { summary: ClientsSummary }) {
  const { saved, billedThisFy, fy, largest, largestNote, slowest, measured, everBilled, neverLate } =
    summary;

  return (
    <div className="flex gap-4 max-xl:grid max-xl:grid-cols-2 max-sm:grid-cols-1">
      <MetricCard
        icon={Users}
        label="Clients billed"
        value={String(billedThisFy)}
        // `saved` is at least 1 — this whole strip is skipped for an empty account.
        delta={<TickBar pct={(billedThisFy / saved) * 100} tone="blue" width={56} />}
        vs={`of ${saved} saved · ${fy}`}
      />

      <MetricCard
        icon={Crown}
        label="Largest client"
        // No money figure here on purpose: a share is comparable, a rupee
        // total sitting beside a dollar total is not.
        value={largest === null ? "—" : `${largest.pct}%`}
        delta={largest === null ? undefined : <ClientChip name={largest.name} />}
        vs={largest === null ? largestNote : `of ${largest.currency} issued`}
      />

      <MetricCard
        icon={Hourglass}
        label="Slowest to pay"
        // avgDaysToPay returns null when no invoice records both a bill date
        // and a payment date; an invented 0 would read as "pays instantly".
        value={slowest === null ? "—" : `${slowest.days} days`}
        delta={slowest === null ? undefined : <ClientChip name={slowest.name} />}
        vs={slowest === null ? "no payment dates recorded" : `across ${pluralClients(measured)}`}
      />

      <MetricCard
        icon={ShieldCheck}
        label="Never late"
        value={everBilled === 0 ? "—" : String(neverLate)}
        delta={
          everBilled === 0 ? undefined : (
            <TickBar pct={(neverLate / everBilled) * 100} tone="green" width={56} />
          )
        }
        vs={everBilled === 0 ? "nothing issued yet" : `of ${everBilled} ever billed`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- rows */

interface ClientRowProps {
  client: Client;
  invoices: Invoice[];
}

function ClientRow({ client, invoices }: ClientRowProps) {
  const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
  const billed =
    clientInvoices.length === 0
      ? "—"
      : formatCurrencyGroups(groupTotalsByCurrency(clientInvoices));
  const open = clientInvoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "overdue"
  ).length;

  // The number that predicts trouble, and the reason this screen is a table:
  // it only means anything compared against the other rows.
  const avgDays = avgDaysToPay(clientInvoices);

  return (
    <Link
      href={`/clients/${client.id}/edit`}
      className="flex items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-canvas"
    >
      <div className="flex min-w-0 flex-[1.8] items-center gap-3">
        <LetterTile letter={initial(client.companyName)} tone="blue" size={32} />
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-medium">{client.companyName}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{client.name || "No contact name"}</div>
        </div>
      </div>
      <div className="min-w-0 flex-[1.3] truncate text-[13px] text-ink-2">{client.email || "—"}</div>
      <div className="min-w-0 flex-1">
        <TwoLineCell
          top={String(clientInvoices.length)}
          sub={open === 0 ? "all settled" : `${open} open`}
        />
      </div>
      <div className="min-w-0 flex-[1.2]">
        <TwoLineCell top={billed} sub={clientInvoices.length === 0 ? "never billed" : "lifetime"} />
      </div>
      <div className="min-w-0 flex-1">
        <TwoLineCell
          top={avgDays === null ? "—" : `${avgDays} days`}
          sub={
            avgDays === null
              ? "no payment dates"
              : avgDays <= 15
                ? "pays quickly"
                : avgDays <= 30
                  ? "on terms"
                  : "slow to pay"
          }
          subClassName={avgDays !== null && avgDays > 30 ? "text-red" : undefined}
        />
      </div>
    </Link>
  );
}
