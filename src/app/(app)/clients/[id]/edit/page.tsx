"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ClientForm } from "@/components/clients/client-form";
import { useClients } from "@/hooks/use-clients";

export default function EditClientPage() {
  const params = useParams();
  const { clients } = useClients();

  const id = params.id as string;
  const client = useMemo(() => clients.find((c) => c.id === id) ?? null, [clients, id]);

  if (!client) {
    return <p className="text-sm text-muted-foreground p-6">Client not found.</p>;
  }

  return <ClientForm client={client} />;
}
