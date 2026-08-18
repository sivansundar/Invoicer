"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/ui/page-skeletons";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
import { avgDaysToPay } from "@/lib/dashboard";
import { LetterTile, Panel, TwoLineCell } from "@/components/ui/primitives";
import { Plus } from "lucide-react";
import type { Client, Invoice } from "@/lib/types";

export default function ClientsPage() {
  return <ClientsPageContent />;
}

function ClientsPageContent() {
  const { clients, loading } = useClients();
  const { invoices } = useInvoices();

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
        ) : (
          clients.map((client) => (
            <ClientRow key={client.id} client={client} invoices={invoices} />
          ))
        )}
      </Panel>
    </div>
  );
}

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
        <LetterTile
          letter={client.companyName.trim().slice(0, 1).toUpperCase() || "?"}
          tone="blue"
          size={32}
        />
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
