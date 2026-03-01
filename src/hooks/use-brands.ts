"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@/lib/types";
import * as storage from "@/lib/storage";

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setBrands(storage.getBrands());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (brand: Brand) => {
      storage.saveBrand(brand);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      storage.deleteBrand(id);
      refresh();
    },
    [refresh]
  );

  return { brands, loading, save, remove, refresh };
}
