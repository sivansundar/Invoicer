"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Client } from "@/lib/types";
import { queryKeys } from "@/lib/query-client";
import * as storage from "@/lib/storage";

const EMPTY: Client[] = [];

/** See use-brands.ts for the contract these four hooks share. */
export function useClients() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: storage.getClients,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.clients }),
    [queryClient]
  );

  const saveMutation = useMutation({
    mutationFn: storage.saveClient,
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: storage.deleteClient,
    onSuccess: invalidate,
  });

  const save = useCallback((client: Client) => saveMutation.mutateAsync(client), [saveMutation]);
  const remove = useCallback((id: string) => removeMutation.mutateAsync(id), [removeMutation]);

  return {
    clients: data ?? EMPTY,
    loading: isPending,
    save,
    remove,
    refresh: invalidate,
  };
}
