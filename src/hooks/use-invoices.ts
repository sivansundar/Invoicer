"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Invoice } from "@/lib/types";
import { queryKeys } from "@/lib/query-client";
import { optimisticRemove, optimisticUpsert } from "./optimistic";
import * as storage from "@/lib/storage";

const EMPTY: Invoice[] = [];

/**
 * See use-brands.ts for the contract these four hooks share.
 *
 * `create` is separate from `save` because creating allocates an invoice
 * number server-side and returns the one actually issued — which is not
 * necessarily the provisional number the form showed while drafting. `save`
 * never touches a number.
 */
export function useInvoices() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: storage.getInvoices,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.invoices }),
    [queryClient]
  );

  const createMutation = useMutation({
    // Wrapped rather than passed directly: `createInvoice` takes an options
    // argument, and `mutateAsync` would hand it the mutation's own second
    // parameter — silently turning a normal create into a preserve-number
    // one. The importer calls the seam directly and does not go through here.
    mutationFn: (invoice: Invoice) => storage.createInvoice(invoice),
    // Deliberately not optimistic, unlike every other mutation here. The
    // server allocates the invoice number, so an optimistic insert would put
    // the form's provisional number into the list and then correct it a
    // moment later — showing the user a number their invoice does not have.
    // Creating also navigates away immediately, so there is no stale view to
    // paper over.
    onSuccess: invalidate,
  });

  const saveMutation = useMutation({
    mutationFn: storage.saveInvoice,
    ...optimisticUpsert<Invoice>(queryClient, queryKeys.invoices),
  });

  const removeMutation = useMutation({
    mutationFn: storage.deleteInvoice,
    ...optimisticRemove<Invoice>(queryClient, queryKeys.invoices),
  });

  const create = useCallback(
    (invoice: Invoice) => createMutation.mutateAsync(invoice),
    [createMutation]
  );
  const save = useCallback(
    (invoice: Invoice) => saveMutation.mutateAsync(invoice),
    [saveMutation]
  );
  const remove = useCallback((id: string) => removeMutation.mutateAsync(id), [removeMutation]);

  return {
    invoices: data ?? EMPTY,
    loading: isPending,
    create,
    save,
    remove,
    refresh: invalidate,
  };
}
