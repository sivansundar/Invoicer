"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Client } from "@/lib/types";
import { useClients } from "@/hooks/use-clients";

interface ClientFormProps {
  client?: Client;
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter();
  const { save } = useClients();

  const [form, setForm] = useState({
    name: client?.name ?? "",
    companyName: client?.companyName ?? "",
    address: client?.address ?? "",
    email: client?.email ?? "",
    gstNumber: client?.gstNumber ?? "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clientData: Client = {
      id: client?.id ?? crypto.randomUUID(),
      name: form.name || undefined,
      companyName: form.companyName,
      address: form.address,
      email: form.email || undefined,
      gstNumber: form.gstNumber || undefined,
      createdAt: client?.createdAt ?? new Date().toISOString(),
    };
    save(clientData);
    router.push("/clients");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Client Details
        </h3>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs">
                Contact Name
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="John Doe"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs">
                Company Name *
              </Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Acme Corp"
                required
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address" className="text-xs">
              Address
            </Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Client address"
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstNumber" className="text-xs">
                GST Number
              </Label>
              <Input
                id="gstNumber"
                value={form.gstNumber}
                onChange={(e) => update("gstNumber", e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" size="sm" className="text-xs">
          {client ? "Update Client" : "Create Client"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push("/clients")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
