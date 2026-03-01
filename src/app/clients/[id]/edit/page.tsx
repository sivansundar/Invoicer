"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { ClientForm } from "@/components/clients/client-form";
import { Client } from "@/lib/types";
import { getClient } from "@/lib/storage";

export default function EditClientPage() {
  const params = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const c = getClient(params.id as string);
    setClient(c);
    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </Shell>
    );
  }

  if (!client) {
    return (
      <Shell>
        <p className="text-xs text-muted-foreground">Client not found</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-lg font-bold">Edit Client</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Update {client.companyName}
        </p>
      </div>
      <ClientForm client={client} />
    </Shell>
  );
}
