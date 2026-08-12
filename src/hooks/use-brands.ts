"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brand } from "@/lib/types";
import { queryKeys } from "@/lib/query-client";
import * as storage from "@/lib/storage";

const EMPTY: Brand[] = [];

/**
 * Return shape is unchanged from the localStorage version — `{ brands,
 * loading, save, remove, refresh }` — so consumers change only by awaiting
 * the mutations and honouring `loading`, which is no longer hardcoded false.
 *
 * `save` and `remove` resolve on success and reject on failure, where they
 * used to return a boolean. Callers that branched on that boolean now use
 * try/catch; a rejected promise left unhandled would otherwise navigate away
 * from an unsaved form.
 */
export function useBrands() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.brands,
    queryFn: storage.getBrands,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.brands }),
    [queryClient]
  );

  const saveMutation = useMutation({
    mutationFn: storage.saveBrand,
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: storage.deleteBrand,
    onSuccess: invalidate,
  });

  const save = useCallback((brand: Brand) => saveMutation.mutateAsync(brand), [saveMutation]);
  const remove = useCallback((id: string) => removeMutation.mutateAsync(id), [removeMutation]);

  return {
    brands: data ?? EMPTY,
    loading: isPending,
    save,
    remove,
    refresh: invalidate,
  };
}
