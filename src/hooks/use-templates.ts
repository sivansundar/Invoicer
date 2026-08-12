"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailTemplate } from "@/lib/types";
import { queryKeys } from "@/lib/query-client";
import * as storage from "@/lib/storage";

const EMPTY: EmailTemplate[] = [];

/** See use-brands.ts for the contract these four hooks share. */
export function useTemplates() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.templates,
    queryFn: storage.getTemplates,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
    [queryClient]
  );

  const saveMutation = useMutation({
    mutationFn: storage.saveTemplate,
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: storage.deleteTemplate,
    onSuccess: invalidate,
  });

  const save = useCallback(
    (template: EmailTemplate) => saveMutation.mutateAsync(template),
    [saveMutation]
  );
  const remove = useCallback((id: string) => removeMutation.mutateAsync(id), [removeMutation]);

  return {
    templates: data ?? EMPTY,
    loading: isPending,
    save,
    remove,
    refresh: invalidate,
  };
}
