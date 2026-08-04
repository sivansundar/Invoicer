"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineItem, Currency } from "@/lib/types";
import { getCurrencySymbol, cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

interface LineItemsTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: Currency;
  /** There's no single control to hang the usual `aria-invalid` convention
   * (see `input.tsx`) on here — `role="group"` doesn't support that
   * attribute (per `jsx-a11y/role-supports-aria-props`) — so the highlight
   * is applied directly via `className` instead, and the error text is
   * still associated programmatically through `aria-describedby`, which
   * *is* a global attribute. */
  invalid?: boolean;
  "aria-describedby"?: string;
}

export function LineItemsTable({
  items,
  onChange,
  currency,
  invalid,
  "aria-describedby": ariaDescribedby,
}: LineItemsTableProps) {
  const addItem = () => {
    onChange([...items, { id: crypto.randomUUID(), description: "", amount: 0, tax: 0 }]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div
      role="group"
      aria-label="Line items"
      aria-describedby={ariaDescribedby}
      className={cn("border rounded-xl bg-card overflow-hidden", invalid && "border-destructive")}
    >
      <div className="h-9 px-3 border-b text-[13px] text-muted-foreground flex items-center gap-2">
        <span className="flex-[1_1_120px]">Description</span>
        <span className="flex-[0_0_120px]">Amount</span>
        <span className="flex-[0_0_64px]">Tax %</span>
        <span className="w-6 shrink-0" />
      </div>

      {items.map((item) => (
        <div key={item.id} className="flex gap-2 items-center px-3 py-2 border-b">
          <Input
            value={item.description}
            onChange={(e) => updateItem(item.id, "description", e.target.value)}
            placeholder="What did you do?"
            className="flex-[1_1_120px] h-8 text-sm"
          />
          <div className="flex-[0_0_120px] flex items-center gap-1">
            <span className="text-muted-foreground text-[13px]">{getCurrencySymbol(currency)}</span>
            <Input
              type="number"
              value={item.amount || ""}
              onChange={(e) => updateItem(item.id, "amount", parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="h-8 text-sm tabular-nums"
              min={0}
            />
          </div>
          <Input
            type="number"
            value={item.tax || ""}
            onChange={(e) => updateItem(item.id, "tax", parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="flex-[0_0_64px] h-8 text-sm tabular-nums"
            min={0}
            max={100}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-destructive"
            title="Remove line"
            onClick={() => removeItem(item.id)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium hover:bg-muted"
      >
        <Plus className="size-3.5" />
        Add line item
      </button>
    </div>
  );
}
