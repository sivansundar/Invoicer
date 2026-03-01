"use client";

import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ClientCard } from "@/components/clients/client-card";
import { useClients } from "@/hooks/use-clients";
import { Plus } from "lucide-react";

export default function ClientsPage() {
  const { clients, loading, remove } = useClients();

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage your client contacts for invoicing
          </p>
        </div>
        <Link href="/clients/create">
          <Button size="sm" className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Client
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a client to quickly fill in invoice details
          </p>
          <Link href="/clients/create">
            <Button size="sm" className="text-xs mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Client
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} onDelete={remove} />
          ))}
        </div>
      )}
    </Shell>
  );
}
