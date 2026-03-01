"use client";

import { useCallback, useEffect, useState } from "react";
import { Client } from "@/lib/types";
import * as storage from "@/lib/storage";

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setClients(storage.getClients());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (client: Client) => {
      storage.saveClient(client);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      storage.deleteClient(id);
      refresh();
    },
    [refresh]
  );

  return { clients, loading, save, remove, refresh };
}
