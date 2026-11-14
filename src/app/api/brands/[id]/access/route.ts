import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { LEVELS } from "@/lib/server/access";

type Ctx = { params: Promise<{ id: string }> };

const fail = (status: number, error: string) => Response.json({ error }, { status });

const Share = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  invoices: z.enum(LEVELS),
  expenses: z.enum(LEVELS),
});

/** Sharing is the owner's alone to see and change. */
async function ownedBrand(ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Please sign in again.");
  const { id } = await ctx.params;
  const d = db();
  const brand = await d.brand.findUnique({ where: { id }, select: { ownerId: true } });
  if (!brand || brand.ownerId !== userId) return fail(404, "Not found.");
  return { d, brandId: id };
}

export async function GET(_req: Request, ctx: Ctx) {
  const r = await ownedBrand(ctx);
  if (r instanceof Response) return r;
  const rows = await r.d.brandAccess.findMany({
    where: { brandId: r.brandId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({
    shares: rows.map((s) => ({
      email: s.email,
      invoices: s.invoices,
      expenses: s.expenses,
      joined: s.userId !== null,
    })),
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const r = await ownedBrand(ctx);
  if (r instanceof Response) return r;
  const parsed = Share.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Enter a valid email address.");
  const { email, invoices, expenses } = parsed.data;

  const key = { brandId_email: { brandId: r.brandId, email } };
  const isNew = !(await r.d.brandAccess.findUnique({ where: key }));
  await r.d.brandAccess.upsert({
    where: key,
    update: { invoices, expenses },
    create: { brandId: r.brandId, email, invoices, expenses },
  });

  // The share is what grants access; the email only tells them about it.
  // Someone who already has an account gets no email and simply sees the
  // brand next time they open the app.
  let invited = false;
  if (isNew) {
    try {
      const clerk = await clerkClient();
      await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: new URL("/sign-up", req.url).toString(),
        ignoreExisting: true,
      });
      invited = true;
    } catch (err) {
      console.error("Clerk invitation failed", err);
    }
  }
  return Response.json({ ok: true, isNew, invited });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await ownedBrand(ctx);
  if (r instanceof Response) return r;
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase() ?? "";
  await r.d.brandAccess.deleteMany({ where: { brandId: r.brandId, email } });
  return Response.json({ ok: true });
}
