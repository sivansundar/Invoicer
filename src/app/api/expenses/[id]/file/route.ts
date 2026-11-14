import { files, findExpense } from "@/lib/server/expenses";

/** The uploaded file itself, for anyone allowed to view the expense. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await findExpense(ctx, "view");
  if (r instanceof Response) return r;
  const object = await files().get(r.row.fileKey);
  if (!object) return Response.json({ error: "The file is missing." }, { status: 404 });
  return new Response(object.body as unknown as BodyInit, {
    headers: {
      "content-type": r.expense.fileType,
      "content-disposition": `inline; filename="${r.expense.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "cache-control": "private, max-age=3600",
      // An uploaded file is shown, never run.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
    },
  });
}
