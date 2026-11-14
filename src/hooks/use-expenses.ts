"use client";

import { useSyncExternalStore } from "react";
import type { Expense } from "@/lib/expenses";
import * as storage from "@/lib/storage";

const EMPTY: Expense[] = [];

export function useExpenses() {
  const expenses = useSyncExternalStore(storage.subscribe, storage.getExpensesSnapshot, () => EMPTY);
  return {
    expenses,
    save: storage.saveExpense,
    remove: storage.deleteExpense,
    upload: storage.uploadExpense,
    reread: storage.rereadExpense,
  };
}
