"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Invoice } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: Invoice[] = [];

export function useInvoices() {
  const invoices = useSyncExternalStore(
    storage.subscribe,
    storage.getInvoicesSnapshot,
    () => EMPTY
  );

  const save = useCallback((invoice: Invoice) => storage.saveInvoice(invoice), []);
  const remove = useCallback((id: string) => storage.deleteInvoice(id), []);

  return { invoices, loading: false, save, remove, refresh: () => {} };
}
