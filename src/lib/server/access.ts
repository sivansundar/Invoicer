import type { Db } from "./db";

export const AREAS = ["invoices", "expenses"] as const;
export type Area = (typeof AREAS)[number];
export const LEVELS = ["none", "view", "edit"] as const;
export type Level = (typeof LEVELS)[number];

/** What a brand's guest may do, per area. Owners have no row: they can do everything. */
export type BrandPermissions = Record<Area, Level>;

const RANK: Record<string, number> = { none: 0, view: 1, edit: 2 };

/**
 * The single permission check. A brand's owner can do anything with it;
 * anyone else needs a share at or above `level` for that area.
 */
export async function can(
  db: Db,
  userId: string,
  brandId: string,
  area: Area,
  level: Exclude<Level, "none">
): Promise<boolean> {
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { ownerId: true } });
  if (!brand) return false;
  if (brand.ownerId === userId) return true;
  const share = await db.brandAccess.findFirst({ where: { brandId, userId } });
  return !!share && (RANK[share[area]] ?? 0) >= RANK[level];
}

/**
 * Links shares addressed to one of the user's verified emails to their
 * account. Runs on every load, so an invite works the first time its
 * recipient signs in, with no webhook.
 */
export async function claimShares(db: Db, userId: string, verifiedEmails: string[]): Promise<void> {
  if (verifiedEmails.length === 0) return;
  await db.brandAccess.updateMany({
    where: { userId: null, email: { in: verifiedEmails.map((e) => e.toLowerCase()) } },
    data: { userId },
  });
}
