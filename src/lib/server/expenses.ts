import { auth } from "@clerk/nextjs/server";
import type { Expense, ExpenseFields } from "@/lib/expenses";
import { EMPTY_EXPENSE_FIELDS } from "@/lib/expenses";
import { can, type Level } from "./access";
import { db, type Db } from "./db";
import { extractExpense } from "./extract-expense";

export type ExpenseCtx = { params: Promise<{ id: string }> };

const fail = (status: number, error: string) => Response.json({ error }, { status });

export const fileKey = (brandId: string, id: string) => `expenses/${brandId}/${id}`;

/** The real columns kept beside the JSON, derived from it so they can't drift. */
export const expenseColumns = (e: Expense) => ({
  status: e.status,
  expenseDate: e.date,
  total: e.total,
  data: JSON.stringify(e),
});

/**
 * Reads the file and returns the fields, or blank fields with `status:
 * "failed"` when it can't be read. Never throws: a failed reading must not
 * lose the upload.
 */
export async function readFields(
  bytes: ArrayBuffer,
  mediaType: string
): Promise<{ status: Expense["status"]; fields: ExpenseFields }> {
  try {
    return { status: "ready", fields: await extractExpense(bytes, mediaType) };
  } catch (err) {
    console.error("Expense extraction failed", err);
    return { status: "failed", fields: EMPTY_EXPENSE_FIELDS };
  }
}

/**
 * The expense, if the signed-in user may use it at `level`. Anything else is
 * "not found", so an id reveals nothing to someone without access.
 */
export async function findExpense(ctx: ExpenseCtx, level: Exclude<Level, "none">) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Please sign in again.");
  const { id } = await ctx.params;
  const d: Db = db();
  const row = await d.expense.findUnique({ where: { id } });
  if (!row || !(await can(d, userId, row.brandId, "expenses", level))) return fail(404, "Not found.");
  return { d, row, expense: JSON.parse(row.data) as Expense };
}

