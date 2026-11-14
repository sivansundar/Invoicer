import type { Brand, Client, Invoice } from "@/lib/types";
import {
  isValidBrandRecord,
  isValidClientRecord,
  isValidInvoiceRecord,
} from "@/lib/import-validation";
import { can, claimShares, type BrandPermissions, type Level } from "./access";
import type { Db } from "./db";

export const KINDS = ["brands", "clients", "invoices"] as const;
export type Kind = (typeof KINDS)[number];

export interface AppData {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
  /** Brands shared with this user, by brand id. A brand they own is absent. */
  permissions: Record<string, BrandPermissions>;
}

/** D1 caps a row at 2 MB; stay well under it. A brand logo is the usual culprit. */
export const MAX_RECORD_BYTES = 1_500_000;

export type WriteResult = { status: 200 } | { status: 400 | 403 | 404 | 409; error: string };

const byCreatedAt = (a: { createdAt: string }, b: { createdAt: string }) =>
  a.createdAt.localeCompare(b.createdAt);

function parseAll<T extends { createdAt: string }>(rows: { data: string }[]): T[] {
  return rows.map((r) => JSON.parse(r.data) as T).sort(byCreatedAt);
}

/**
 * Everything `userId` owns, plus the brands shared with them and, where the
 * share allows it, those brands' invoices. Clients are never shared: a guest
 * sees the client details already copied onto each invoice.
 */
export async function loadData(db: Db, userId: string, verifiedEmails: string[] = []): Promise<AppData> {
  await claimShares(db, userId, verifiedEmails);
  const where = { ownerId: userId };
  const select = { data: true };
  const [brands, clients, invoices, shares] = await Promise.all([
    db.brand.findMany({ where, select }),
    db.client.findMany({ where, select }),
    db.invoice.findMany({ where, select }),
    db.brandAccess.findMany({ where: { userId } }),
  ]);

  const permissions: AppData["permissions"] = {};
  const sharedBrands: { data: string }[] = [];
  const sharedInvoices: { data: string }[] = [];
  for (const share of shares) {
    const brand = await db.brand.findUnique({ where: { id: share.brandId } });
    if (!brand || brand.ownerId === userId) continue;
    permissions[brand.id] = { invoices: share.invoices as Level, expenses: share.expenses as Level };
    sharedBrands.push(brand);
    if (share.invoices !== "none") {
      // ownerId too: only the invoices the brand's owner actually holds.
      sharedInvoices.push(
        ...(await db.invoice.findMany({ where: { brandId: brand.id, ownerId: brand.ownerId }, select }))
      );
    }
  }

  return {
    brands: parseAll<Brand>([...brands, ...sharedBrands]),
    clients: parseAll<Client>(clients),
    invoices: parseAll<Invoice>([...invoices, ...sharedInvoices]),
    permissions,
  };
}

const NOT_FOUND: WriteResult = { status: 404, error: "Not found." };
const INVALID: WriteResult = { status: 400, error: "That record isn't valid, so it wasn't saved." };

/**
 * Creates or replaces one record. Ids are made up by the browser, so an id
 * that already belongs to someone else is answered as "not found" rather
 * than overwritten.
 */
export async function putRecord(
  db: Db,
  userId: string,
  kind: Kind,
  id: string,
  body: unknown
): Promise<WriteResult> {
  if (kind === "brands" || kind === "clients") {
    const valid = kind === "brands" ? isValidBrandRecord(body) : isValidClientRecord(body);
    if (!valid || (body as { id: string }).id !== id) return INVALID;
    const data = JSON.stringify(body);
    // Prisma's model delegates don't share a call signature, hence the branch.
    if (kind === "brands") {
      const existing = await db.brand.findUnique({ where: { id }, select: { ownerId: true } });
      if (existing && existing.ownerId !== userId) return NOT_FOUND;
      await db.brand.upsert({ where: { id }, update: { data }, create: { id, ownerId: userId, data } });
    } else {
      const existing = await db.client.findUnique({ where: { id }, select: { ownerId: true } });
      if (existing && existing.ownerId !== userId) return NOT_FOUND;
      await db.client.upsert({ where: { id }, update: { data }, create: { id, ownerId: userId, data } });
    }
    return { status: 200 };
  }

  if (!isValidInvoiceRecord(body) || body.id !== id) return INVALID;
  const existing = await db.invoice.findUnique({
    where: { id },
    select: { ownerId: true, brandId: true },
  });
  // Editing means being allowed to edit the brand it is filed under now...
  if (existing && existing.ownerId !== userId && !(await can(db, userId, existing.brandId, "invoices", "edit"))) {
    return NOT_FOUND;
  }
  // ...and the brand it is being saved into. A brand that no longer exists is
  // fine for its owner (invoices outlive their brand).
  const brand = await db.brand.findUnique({ where: { id: body.brandId }, select: { ownerId: true } });
  if (brand && !(await can(db, userId, body.brandId, "invoices", "edit"))) {
    return { status: 403, error: "You can't add invoices to that brand." };
  }
  // An invoice a guest creates belongs to the brand's owner, not the guest.
  const ownerId = existing?.ownerId ?? brand?.ownerId ?? userId;
  const clash = await db.invoice.findFirst({
    where: { brandId: body.brandId, invoiceNumber: body.invoiceNumber, NOT: { id } },
    select: { id: true },
  });
  if (clash) {
    return {
      status: 409,
      error: `Invoice number ${body.invoiceNumber} is already used for this brand.`,
    };
  }
  const fields = {
    brandId: body.brandId,
    invoiceNumber: body.invoiceNumber,
    status: body.status,
    data: JSON.stringify(body),
  };
  // The unique index on (brand_id, invoice_number) still backs this up if two
  // saves race past the check above; that case surfaces as a 500.
  await db.invoice.upsert({
    where: { id },
    update: fields,
    create: { id, ownerId, ...fields },
  });
  return { status: 200 };
}

export async function deleteRecord(db: Db, userId: string, kind: Kind, id: string): Promise<void> {
  const where = { id, ownerId: userId };
  if (kind === "brands") {
    await db.brand.deleteMany({ where });
    // Shares of a brand that is gone (no-op if the brand wasn't theirs to delete).
    if (!(await db.brand.findUnique({ where: { id } }))) {
      await db.brandAccess.deleteMany({ where: { brandId: id } });
    }
  } else if (kind === "clients") {
    await db.client.deleteMany({ where });
  } else {
    const invoice = await db.invoice.findUnique({ where: { id }, select: { ownerId: true, brandId: true } });
    if (!invoice) return;
    if (invoice.ownerId === userId || (await can(db, userId, invoice.brandId, "invoices", "edit"))) {
      await db.invoice.deleteMany({ where: { id } });
    }
  }
}
