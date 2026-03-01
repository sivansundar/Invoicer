"use client";

import { useCallback, useEffect, useState } from "react";
import { Invoice } from "@/lib/types";
import * as storage from "@/lib/storage";

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setInvoices(storage.getInvoices());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (invoice: Invoice) => {
      storage.saveInvoice(invoice);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      storage.deleteInvoice(id);
      refresh();
    },
    [refresh]
  );

  return { invoices, loading, save, remove, refresh };
}
