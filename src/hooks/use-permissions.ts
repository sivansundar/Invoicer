"use client";

import { useCallback, useSyncExternalStore } from "react";
import * as storage from "@/lib/storage";

const NONE = {};
const NO_BRANDS: ReturnType<typeof storage.getBrandsSnapshot> = [];

/**
 * What the signed-in user may do with a brand. Hides controls only: the
 * server makes the same checks on every request.
 */
export function usePermissions() {
  const shared = useSyncExternalStore(storage.subscribe, storage.getPermissionsSnapshot, () => NONE as ReturnType<typeof storage.getPermissionsSnapshot>);

  /** True for a brand the user owns (or one that no longer exists). */
  const isOwner = useCallback((brandId: string) => !(brandId in shared), [shared]);
  const canEdit = useCallback(
    (brandId: string, area: "invoices" | "expenses") => !(brandId in shared) || shared[brandId][area] === "edit",
    [shared]
  );
  const canView = useCallback(
    (brandId: string, area: "invoices" | "expenses") => !(brandId in shared) || shared[brandId][area] !== "none",
    [shared]
  );

  return { isOwner, canEdit, canView };
}

/** False only for someone whose every brand is shared with them view-only. */
export function useCanCreateInvoices(): boolean {
  const brands = useSyncExternalStore(storage.subscribe, storage.getBrandsSnapshot, () => NO_BRANDS);
  const { canEdit } = usePermissions();
  return brands.length === 0 || brands.some((b) => canEdit(b.id, "invoices"));
}
