"use client";

import Link from "next/link";
import { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

interface ClientCardProps {
  client: Client;
  onDelete: (id: string) => void;
}

export function ClientCard({ client, onDelete }: ClientCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Card className="group">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-bold">
            {client.companyName.charAt(0).toUpperCase()}
          </div>
          <div>
            <CardTitle className="text-sm">{client.companyName}</CardTitle>
            {client.name && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {client.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/clients/${client.id}/edit`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Pencil className="h-3 w-3" />
            </Button>
          </Link>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Trash2 className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-sm">Delete Client</DialogTitle>
                <DialogDescription className="text-xs">
                  Are you sure you want to delete &ldquo;{client.companyName}&rdquo;?
                  This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    onDelete(client.id);
                    setDeleteOpen(false);
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground space-y-1">
        {client.email && <p>{client.email}</p>}
        {client.phone && <p>{client.phone}</p>}
        {client.address && <p>{client.address}</p>}
        {client.gstNumber && <p>GST: {client.gstNumber}</p>}
      </CardContent>
    </Card>
  );
}
