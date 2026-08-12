"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ClientForm } from "@/components/clients/client-form";
import { FormSkeleton } from "@/components/ui/page-skeletons";
import { useClients } from "@/hooks/use-clients";

export default function EditClientPage() {
  const params = useParams();
  const { clients, loading } = useClients();

  const id = params.id as string;
  const client = useMemo(() => clients.find((c) => c.id === id) ?? null, [clients, id]);

  // See brands/[id]/edit for why this precedes the not-found check.
  if (loading) return <FormSkeleton />;

  if (!client) {
    return <p className="text-sm text-muted-foreground p-6">Client not found.</p>;
  }

  return <ClientForm client={client} />;
}
