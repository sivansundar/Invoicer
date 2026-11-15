import { ExpenseFields, type Expense } from "@/lib/expenses";
import { expenseColumns, findExpense, type ExpenseCtx as Ctx } from "@/lib/server/expenses";
import { files } from "@/lib/server/files";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Correct an expense's fields. The file, brand and upload details can't be changed. */
export async function PUT(req: Request, ctx: Ctx) {
  const r = await findExpense(ctx, "edit");
  if (r instanceof Response) return r;
  const parsed = ExpenseFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "That expense isn't valid, so it wasn't saved.");

  const expense: Expense = {
    ...r.expense,
    ...parsed.data,
    // Saved by a person, so it now counts as read even if the file never was.
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
  await r.d.expense.update({ where: { id: r.row.id }, data: expenseColumns(expense) });
  return Response.json({ ok: true, expense });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await findExpense(ctx, "edit");
  if (r instanceof Response) return r;
  await r.d.expense.delete({ where: { id: r.row.id } });
  await files.delete(r.row.fileKey);
  return Response.json({ ok: true });
}
