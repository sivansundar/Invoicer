import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/server/db";
import {
  KINDS,
  MAX_RECORD_BYTES,
  deleteRecord,
  putRecord,
  type Kind,
} from "@/lib/server/data";

type Ctx = { params: Promise<{ kind: string; id: string }> };

const fail = (status: number, error: string) => Response.json({ error }, { status });

async function resolve(ctx: Ctx): Promise<{ userId: string; kind: Kind; id: string } | Response> {
  const { userId } = await auth();
  if (!userId) return fail(401, "Please sign in again.");
  const { kind, id } = await ctx.params;
  if (!(KINDS as readonly string[]).includes(kind)) return fail(404, "Not found.");
  return { userId, kind: kind as Kind, id };
}

export async function PUT(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof Response) return r;
  const text = await req.text();
  if (text.length > MAX_RECORD_BYTES) {
    return fail(413, "That's too large to save. If it has a logo, use a smaller image.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "That record isn't valid, so it wasn't saved.");
  }
  const result = await putRecord(db(), r.userId, r.kind, r.id, body);
  return result.status === 200 ? Response.json({ ok: true }) : fail(result.status, result.error);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof Response) return r;
  const blocked = await deleteRecord(db(), r.userId, r.kind, r.id);
  return blocked ? fail(409, blocked) : Response.json({ ok: true });
}
