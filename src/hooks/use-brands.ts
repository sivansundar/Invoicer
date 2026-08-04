"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Brand } from "@/lib/types";
import * as storage from "@/lib/storage";

const EMPTY: Brand[] = [];

export function useBrands() {
  const brands = useSyncExternalStore(storage.subscribe, storage.getBrandsSnapshot, () => EMPTY);

  const save = useCallback((brand: Brand) => storage.saveBrand(brand), []);
  const remove = useCallback((id: string) => storage.deleteBrand(id), []);

  return { brands, loading: false, save, remove, refresh: () => {} };
}
