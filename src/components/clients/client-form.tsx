"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { invoicesToUnlink } from "@/lib/clients";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/types";

interface ClientFormProps {
  client?: Client;
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter();
  const { save, remove } = useClients();
  const { invoices, save: saveInvoice } = useInvoices();
  const isEdit = !!client;

  const [companyName, setCompanyName] = useState(client?.companyName ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [gstNumber, setGstNumber] = useState(client?.gstNumber ?? "");

  const clientInvoices = isEdit ? invoicesToUnlink(client.id, invoices) : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = companyName.trim();
    if (!trimmedName) {
      toast("Who are we billing? Add a company name");
      return;
    }

    const record: Client = {
      id: client?.id ?? crypto.randomUUID(),
      name: name || undefined,
      companyName: trimmedName,
      address,
      email: email || undefined,
      phone: phone || undefined,
      gstNumber: gstNumber || undefined,
      createdAt: client?.createdAt ?? new Date().toISOString(),
    };

    // `save` (from `useClients`) rejects when the write didn't persist — a
    // network failure, or an RLS policy refusing the row. Toasting success
    // and navigating away regardless would tell the user this worked when it
    // didn't, and take them off the one screen still holding what they typed.
    try {
      await save(record);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save this client — try again");
      return;
    }

    toast(
      isEdit
        ? `${trimmedName} updated — new invoices will use the latest details`
        : `${trimmedName} added to your client book`
    );
    router.push("/clients");
  };

  const handleDelete = async () => {
    if (!client) return;

    // Unlike a brand — whose invoices carry only a live `brandId`, nothing
    // else — every invoice already carries its own frozen `client` snapshot
    // (that's what actually renders). Deleting the client record here can
    // never corrupt what already printed on a sent invoice, so this isn't
    // guarded like `brandDeleteGuard`. But leaving `clientId` pointed at a
    // record that no longer exists would silently drop those invoices out of
    // every future count/total on this list, and — on that invoice's own
    // edit screen — the "Billed to" select has no matching item to show, so
    // it would render as unselected even though the invoice is really just
    // unlinked. Nulling the back-reference on every invoice that has it
    // converts each one to the same "manual entry, no live client" shape the
    // v1→v2 migration already produces for a legacy invoice whose client
    // record no longer exists (see `invoice-form.tsx`) — an established
    // shape, not a new one, and the one that's honest about what happened.
    //
    // Order matters: the client record itself is removed first, and only
    // once that write is confirmed does the cascade start — nulling
    // references before confirming the delete actually persisted would risk
    // unlinking invoices from a client that's still there. Each nulling write
    // is checked too, not just the first one: a failure can strike on invoice
    // 3 of 5 as easily as on the first write, and silently telling the user
    // "removed" while an invoice is left with a dangling `clientId` is
    // exactly the false-success bug this pattern exists to prevent.
    //
    try {
      await remove(client.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't remove this client — try again");
      return;
    }

    // `allSettled`, not `all`: one invoice failing to unlink must not abort
    // the rest, and the count of what failed is exactly what the summary
    // below reports. `all` would reject on the first failure and leave the
    // remaining invoices untouched with no accounting for them.
    const results = await Promise.allSettled(
      clientInvoices.map((invoice) =>
        saveInvoice({ ...invoice, clientId: null, updatedAt: new Date().toISOString() })
      )
    );
    const failures = results.filter((result) => result.status === "rejected").length;

    if (failures > 0) {
      toast(
        `${client.companyName} removed, but ${failures} of ${clientInvoices.length} ` +
          `invoice${clientInvoices.length === 1 ? "" : "s"} couldn't be re-linked — ` +
          `reopen ${failures === 1 ? "it" : "them"} and save again.`
      );
    } else {
      toast(`${client.companyName} removed`);
    }
    router.push("/clients");
  };

  return (
    <div className="p-6 max-w-[660px]">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit"
      >
        <ChevronLeft className="size-3.5" />
        Clients
      </Link>
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mt-3">
        {isEdit ? `Edit ${client.companyName}` : "New client"}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {isEdit
          ? "Changes apply from here on — invoices already sent keep their own copy of the original details."
          : "Add them once — they'll appear in every invoice form."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="border rounded-[14px] bg-card shadow-sm p-6 flex flex-col gap-5 mt-6"
      >
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Studio"
              className="text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contact person</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Address</Label>
          <Textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, PIN"
            rows={3}
            className="text-sm"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accounts@company.com"
              className="text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className="text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">GST number</Label>
          <Input
            value={gstNumber}
            onChange={(e) => setGstNumber(e.target.value)}
            placeholder="Optional"
            className="text-sm max-w-[280px]"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/clients")}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {isEdit ? "Save changes" : "Add client"}
          </Button>
        </div>
      </form>

      {isEdit && (
        <div className="flex items-center gap-3 mt-4">
          <span className="text-[13px] text-muted-foreground">
            {clientInvoices.length === 0
              ? "No invoices reference this client yet"
              : `${clientInvoices.length} ${
                  clientInvoices.length === 1 ? "invoice keeps" : "invoices keep"
                } its own copy of these details — deleting won't change them`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "ml-auto",
              "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
            )}
            onClick={handleDelete}
          >
            Delete client
          </Button>
        </div>
      )}
    </div>
  );
}
