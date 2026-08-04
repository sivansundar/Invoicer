"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Client } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: Client[] = [];

export function useClients() {
  const clients = useSyncExternalStore(
    storage.subscribe,
    storage.getClientsSnapshot,
    () => EMPTY
  );

  const save = useCallback((client: Client) => storage.saveClient(client), []);
  const remove = useCallback((id: string) => storage.deleteClient(id), []);

  return { clients, loading: false, save, remove, refresh: () => {} };
}
