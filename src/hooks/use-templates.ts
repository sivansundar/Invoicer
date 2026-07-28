"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EmailTemplate } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: EmailTemplate[] = [];

export function useTemplates() {
  const templates = useSyncExternalStore(
    storage.subscribe,
    storage.getTemplatesSnapshot,
    () => EMPTY
  );

  const save = useCallback((template: EmailTemplate) => storage.saveTemplate(template), []);
  const remove = useCallback((id: string) => storage.deleteTemplate(id), []);

  return { templates, loading: false, save, remove, refresh: () => {} };
}
