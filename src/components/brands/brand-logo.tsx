"use client";

import { useLogoSrc, type LogoSource } from "@/hooks/use-logo-src";

interface BrandLogoProps {
  source: LogoSource;
  /** Used as the image's alt text and as the source of the fallback initial. */
  name: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * The logo-or-initial pair, in one place.
 *
 * Both invoice designs rendered this themselves, with the same fallback
 * markup at different sizes — four copies of a branch that now has to
 * understand two logo shapes. The sizing stays per-design via `className`.
 */
export function BrandLogo({ source, name, className, fallbackClassName }: BrandLogoProps) {
  const src = useLogoSrc(source);

  if (src) {
    // Signed URLs are short-lived and host-specific; next/image would need
    // remotePatterns for every Supabase project and buys nothing for a 32px
    // mark.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={className} />;
  }

  return (
    <div className={fallbackClassName} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
