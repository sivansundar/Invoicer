import { auth } from "@clerk/nextjs/server";
import { expenseFileProblem, type Expense } from "@/lib/expenses";
import { can } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { expenseColumns, fileKey, readFields } from "@/lib/server/expenses";
import { files } from "@/lib/server/files";

// Reading an invoice with Claude can take longer than Vercel's default limit.
export const maxDuration = 60;

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Upload one purchase invoice: store the file, read it, save the expense. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Please sign in again.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const brandId = form?.get("brandId");
  if (!(file instanceof File) || typeof brandId !== "string") return fail(400, "Choose a file and a brand.");
  const problem = expenseFileProblem(file);
  if (problem) return fail(400, problem);

  const d = db();
  if (!(await can(d, userId, brandId, "expenses", "edit"))) {
    return fail(403, "You can't add expenses to that brand.");
  }

  const id = crypto.randomUUID();
  const bytes = await file.arrayBuffer();
  await files.put(fileKey(brandId, id), bytes, file.type);

  const { status, fields } = await readFields(bytes, file.type);
  const now = new Date().toISOString();
  const expense: Expense = {
    ...fields,
    id,
    brandId,
    status,
    fileName: file.name.slice(0, 200),
    fileType: file.type,
    createdAt: now,
    updatedAt: now,
  };
  await d.expense.create({
    data: { id, brandId, fileKey: fileKey(brandId, id), uploadedBy: userId, ...expenseColumns(expense) },
  });
  return Response.json({ expense });
}
