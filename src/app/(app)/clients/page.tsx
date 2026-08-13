"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/ui/page-skeletons";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { formatCurrencyGroups, groupTotalsByCurrency } from "@/lib/money";
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
    <div className="p-6 max-w-[1000px] flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved once, auto-filled on every invoice.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link href="/clients/create">
            <Plus className="size-4" />
            New client
          </Link>
        </Button>
      </div>

      <div className="border rounded-[14px] bg-card overflow-hidden">
        <div className="flex items-center h-10 px-4 border-b text-sm font-medium">
          <div className="flex-[1.4]">Company</div>
          <div className="flex-1">Contact</div>
          <div className="flex-[1.3]">Email</div>
          <div className="flex-[0.6] text-right">Invoices</div>
          <div className="flex-1 text-right">Billed</div>
        </div>

        {clients.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add one to fill it in automatically on every invoice.
            </p>
          </div>
        ) : (
          clients.map((client) => (
            <ClientRow key={client.id} client={client} invoices={invoices} />
          ))
        )}
      </div>
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

  return (
    <Link
      href={`/clients/${client.id}/edit`}
      className="flex items-center px-4 py-3 border-b text-sm cursor-pointer hover:bg-muted last:border-b-0"
    >
      <div className="flex-[1.4] font-medium truncate pr-2">{client.companyName}</div>
      <div className="flex-1 truncate pr-2">{client.name || "—"}</div>
      <div className="flex-[1.3] text-[13px] text-muted-foreground truncate pr-2">
        {client.email || "—"}
      </div>
      <div className="flex-[0.6] text-right tabular-nums text-muted-foreground">
        {clientInvoices.length}
      </div>
      <div className="flex-1 text-right font-medium tabular-nums">{billed}</div>
    </Link>
  );
}
