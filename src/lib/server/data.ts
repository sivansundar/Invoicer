import type { Brand, Client, Invoice } from "@/lib/types";
import {
  isValidBrandRecord,
  isValidClientRecord,
  isValidInvoiceRecord,
} from "@/lib/import-validation";
import type { Db } from "./db";

export const KINDS = ["brands", "clients", "invoices"] as const;
export type Kind = (typeof KINDS)[number];

export interface AppData {
  brands: Brand[];
  clients: Client[];
  invoices: Invoice[];
}

/** D1 caps a row at 2 MB; stay well under it. A brand logo is the usual culprit. */
export const MAX_RECORD_BYTES = 1_500_000;

export type WriteResult = { status: 200 } | { status: 400 | 403 | 404 | 409; error: string };

const byCreatedAt = (a: { createdAt: string }, b: { createdAt: string }) =>
  a.createdAt.localeCompare(b.createdAt);

function parseAll<T extends { createdAt: string }>(rows: { data: string }[]): T[] {
  return rows.map((r) => JSON.parse(r.data) as T).sort(byCreatedAt);
}

/** Everything `userId` owns. */
export async function loadData(db: Db, userId: string): Promise<AppData> {
  const where = { ownerId: userId };
  const select = { data: true };
  const [brands, clients, invoices] = await Promise.all([
    db.brand.findMany({ where, select }),
    db.client.findMany({ where, select }),
    db.invoice.findMany({ where, select }),
  ]);
  return {
    brands: parseAll<Brand>(brands),
    clients: parseAll<Client>(clients),
    invoices: parseAll<Invoice>(invoices),
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
  const existing = await db.invoice.findUnique({ where: { id }, select: { ownerId: true } });
  if (existing && existing.ownerId !== userId) return NOT_FOUND;
  // A brand that no longer exists is fine (invoices outlive their brand);
  // someone else's brand is not.
  const brand = await db.brand.findUnique({ where: { id: body.brandId }, select: { ownerId: true } });
  if (brand && brand.ownerId !== userId) {
    return { status: 403, error: "You can't add invoices to that brand." };
  }
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
    create: { id, ownerId: userId, ...fields },
  });
  return { status: 200 };
}

export async function deleteRecord(db: Db, userId: string, kind: Kind, id: string): Promise<void> {
  const where = { id, ownerId: userId };
  if (kind === "brands") await db.brand.deleteMany({ where });
  else if (kind === "clients") await db.client.deleteMany({ where });
  else await db.invoice.deleteMany({ where });
}
