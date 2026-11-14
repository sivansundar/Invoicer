"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExpenses } from "@/hooks/use-expenses";
import { reviewReasons, type Expense, type ExpenseFields } from "@/lib/expenses";

type Item = ExpenseFields["items"][number];

const text = (v: string | null) => v ?? "";
const orNull = (v: string) => (v.trim() ? v.trim() : null);
/** A blank or unparseable number box is null (or 0 where the field can't be empty). */
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

const MONEY_FIELDS = [
  ["subtotal", "Subtotal (before tax)"],
  ["cgst", "CGST"],
  ["sgst", "SGST"],
  ["igst", "IGST"],
  ["otherTax", "Other tax"],
  ["total", "Total"],
] as const;

export function ExpenseDetail({ expense, editable }: { expense: Expense; editable: boolean }) {
  const router = useRouter();
  const { save, remove, reread } = useExpenses();
  const [draft, setDraft] = useState<Expense>(expense);
  const [busy, setBusy] = useState<"save" | "reread" | "delete" | null>(null);

  const set = (patch: Partial<ExpenseFields>) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (index: number, patch: Partial<Item>) =>
    set({ items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const fileUrl = `/api/expenses/${encodeURIComponent(expense.id)}/file`;
  const review = reviewReasons(draft);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    // Saved by a person, so it counts as read from here on (the server does the same).
    const ok = await save({ ...draft, status: "ready", updatedAt: new Date().toISOString() });
    setBusy(null);
    if (ok) toast("Expense saved");
  };

  const handleReread = async () => {
    setBusy("reread");
    const result = await reread(expense.id);
    setBusy(null);
    if (result) toast("Read again from the file");
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this expense and its file? This can't be undone.")) return;
    setBusy("delete");
    const ok = await remove(expense.id);
    setBusy(null);
    if (!ok) return;
    toast("Expense deleted");
    router.push("/expenses");
  };

  return (
    <div className="flex flex-wrap items-stretch flex-1 min-h-0">
      <form onSubmit={handleSave} className="flex-[1_1_460px] min-w-0 p-6 max-w-[680px] flex flex-col gap-5">
        <Link href="/expenses" className="text-[13px] text-muted-foreground hover:text-foreground w-fit">
          ← Expenses
        </Link>

        {review.length > 0 && (
          <ul role="status" className="border rounded-[14px] bg-muted p-4 text-sm flex flex-col gap-1">
            {review.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        <fieldset disabled={!editable || busy !== null} className="flex flex-col gap-5 min-w-0">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor" id="vendor">
              <Input id="vendor" value={draft.vendorName} onChange={(e) => set({ vendorName: e.target.value })} />
            </Field>
            <Field label="Vendor GSTIN" id="gstin">
              <Input
                id="gstin"
                value={text(draft.vendorGstin)}
                onChange={(e) => set({ vendorGstin: orNull(e.target.value) })}
                className="font-mono"
              />
            </Field>
            <Field label="Invoice number" id="invoice-number">
              <Input
                id="invoice-number"
                value={text(draft.invoiceNumber)}
                onChange={(e) => set({ invoiceNumber: orNull(e.target.value) })}
              />
            </Field>
            <Field label="Invoice date" id="date">
              <Input
                id="date"
                type="date"
                value={text(draft.date)}
                onChange={(e) => set({ date: orNull(e.target.value) })}
              />
            </Field>
            <Field label="Currency" id="currency">
              <Input
                id="currency"
                value={draft.currency}
                maxLength={3}
                onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Line items</h2>
            {draft.items.length > 0 && (
              <div className="grid grid-cols-[1fr_84px_60px_84px_92px_60px_28px] gap-1.5 text-xs text-muted-foreground">
                <span>Description</span>
                <span>HSN/SAC</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Amount</span>
                <span>Tax %</span>
                <span />
              </div>
            )}
            {draft.items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_84px_60px_84px_92px_60px_28px] gap-1.5 items-center">
                <Input
                  aria-label={`Item ${i + 1} description`}
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
                <Input
                  aria-label={`Item ${i + 1} HSN or SAC`}
                  value={text(item.hsnSac)}
                  onChange={(e) => setItem(i, { hsnSac: orNull(e.target.value) })}
                />
                <Input
                  aria-label={`Item ${i + 1} quantity`}
                  inputMode="decimal"
                  value={item.quantity ?? ""}
                  onChange={(e) => setItem(i, { quantity: num(e.target.value) })}
                />
                <Input
                  aria-label={`Item ${i + 1} rate`}
                  inputMode="decimal"
                  value={item.rate ?? ""}
                  onChange={(e) => setItem(i, { rate: num(e.target.value) })}
                />
                <Input
                  aria-label={`Item ${i + 1} amount`}
                  inputMode="decimal"
                  value={item.amount}
                  onChange={(e) => setItem(i, { amount: num(e.target.value) ?? 0 })}
                />
                <Input
                  aria-label={`Item ${i + 1} tax percent`}
                  inputMode="decimal"
                  value={item.taxPercent ?? ""}
                  onChange={(e) => setItem(i, { taxPercent: num(e.target.value) })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            {editable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5"
                onClick={() =>
                  set({
                    items: [
                      ...draft.items,
                      { description: "", hsnSac: null, quantity: null, rate: null, amount: 0, taxPercent: null },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" />
                Add item
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {MONEY_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} id={key}>
                <Input
                  id={key}
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(e) => set({ [key]: num(e.target.value) ?? 0 })}
                  className="tabular-nums"
                />
              </Field>
            ))}
          </div>
        </fieldset>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReread} disabled={busy !== null}>
              {busy === "reread" ? "Reading…" : "Read the file again"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={busy !== null}
            >
              Delete
            </Button>
          </div>
        )}
      </form>

      <div className="flex-[1_1_420px] min-w-0 border-l bg-muted p-4 flex flex-col gap-2 min-h-[70vh]">
        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-[13px] underline underline-offset-2 w-fit">
          Open {expense.fileName} in a new tab
        </a>
        {expense.fileType === "application/pdf" ? (
          <iframe src={fileUrl} title={`Uploaded invoice ${expense.fileName}`} className="flex-1 w-full rounded-md border bg-background" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own API behind auth; next/image can't fetch it
          <img src={fileUrl} alt={`Uploaded invoice ${expense.fileName}`} className="max-w-full rounded-md border" />
        )}
      </div>
    </div>
  );
}
