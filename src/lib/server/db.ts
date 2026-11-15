import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

let client: Db | undefined;

/**
 * Prisma over Cloudflare D1's HTTP API (the app runs on Vercel, outside
 * Cloudflare, so there is no direct binding). One client per server
 * instance, so its HTTPS connection is reused between requests.
 */
// shortcut: every query is a separate HTTPS round trip (about 0.1–0.5 s).
// If saves feel slow, batch the reads in putRecord, or host on Workers.
export function db(): Db {
  client ??= new PrismaClient({
    adapter: new PrismaD1({
      CLOUDFLARE_D1_TOKEN: required("CLOUDFLARE_D1_TOKEN"),
      CLOUDFLARE_ACCOUNT_ID: required("CLOUDFLARE_ACCOUNT_ID"),
      CLOUDFLARE_DATABASE_ID: required("CLOUDFLARE_DATABASE_ID"),
    }),
  });
  return client;
}
