import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

/** One client per request. `DB` is the D1 binding in wrangler.jsonc. */
export function db(): Db {
  return new PrismaClient({ adapter: new PrismaD1(getCloudflareContext().env.DB) });
}
