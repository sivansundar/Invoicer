import type { Expense } from "@/lib/expenses";
import { expenseColumns, findExpense, readFields } from "@/lib/server/expenses";
import { files } from "@/lib/server/files";

export const maxDuration = 60;

/** Read the stored file again, replacing the expense's fields. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await findExpense(ctx, "edit");
  if (r instanceof Response) return r;
  const object = await files.get(r.row.fileKey);
  if (!object) return Response.json({ error: "The file is missing." }, { status: 404 });

  const { status, fields } = await readFields(await object.arrayBuffer(), r.expense.fileType);
  if (status === "failed") {
    return Response.json({ error: "That file still couldn't be read." }, { status: 502 });
  }
  const expense: Expense = { ...r.expense, ...fields, status, updatedAt: new Date().toISOString() };
  await r.d.expense.update({ where: { id: r.row.id }, data: expenseColumns(expense) });
  return Response.json({ expense });
}
