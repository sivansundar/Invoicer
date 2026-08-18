"use client";

import { useQuery } from "@tanstack/react-query";
import * as storage from "@/lib/storage";
import { queryKeys } from "@/lib/query-client";

/**
 * A logo lives in one of two shapes and always will: base64 on records
 * written before Storage, and an object path after. The §11 importer keeps
 * bringing base64 snapshots in indefinitely, so this is not a migration
 * window — see spec §8.2.
 */
export interface LogoSource {
  logo?: string;
  logoPath?: string;
}

/**
 * Refetch comfortably before `LOGO_URL_TTL_SECONDS` so a URL never expires
 * while it is on screen.
 */
const LOGO_URL_STALE_MS = (storage.LOGO_URL_TTL_SECONDS - 600) * 1000;

/**
 * Resolves either shape to something an `<img>` can use, or `undefined`
 * while a signed URL is in flight or if signing failed. Callers render their
 * fallback for `undefined` — a broken image is worse than an initial.
 */
export function useLogoSrc(source: LogoSource): string | undefined {
  const path = source.logoPath;

  const { data } = useQuery({
    queryKey: queryKeys.logoUrl(path ?? ""),
    queryFn: () => storage.getLogoUrl(path!),
    enabled: !!path,
    staleTime: LOGO_URL_STALE_MS,
  });

  // The path wins when both are present. A snapshot carrying both would mean
  // the base64 is the older of the two.
  return path ? data : source.logo;
}
