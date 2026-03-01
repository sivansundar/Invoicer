"use client";

import { Shell } from "@/components/layout/shell";
import { ClientForm } from "@/components/clients/client-form";

export default function CreateClientPage() {
  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-lg font-bold">Add Client</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Save client details for quick invoicing
        </p>
      </div>
      <ClientForm />
    </Shell>
  );
}
