"use client";

import { useParams } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { ExpenseDetail } from "@/components/expenses/expense-detail";
import { useExpenses } from "@/hooks/use-expenses";
import { usePermissions } from "@/hooks/use-permissions";

export default function ExpensePage() {
  const { id } = useParams<{ id: string }>();
  const { expenses } = useExpenses();
  const { canEdit } = usePermissions();
  const expense = expenses.find((e) => e.id === id);

  return (
    <Shell>
      {expense ? (
        // Keyed so the form resets to the stored values after a re-read.
        <ExpenseDetail
          key={`${expense.id}:${expense.updatedAt}`}
          expense={expense}
          editable={canEdit(expense.brandId, "expenses")}
        />
      ) : (
        <p className="text-sm text-muted-foreground p-6">Expense not found.</p>
      )}
    </Shell>
  );
}
