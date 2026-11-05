"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LineItem, Currency } from "@/lib/types";
import { getCurrencySymbol, cn } from "@/lib/utils";
import { lineAmount, lineQuantity, lineRate } from "@/lib/invoice-preview";
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
  /** Export under LUT: every line is 0% and the Tax % inputs are read-only. */
  taxDisabled?: boolean;
  "aria-describedby"?: string;
}

export function LineItemsTable({
  items,
  onChange,
  currency,
  invalid,
  taxDisabled,
  "aria-describedby": ariaDescribedby,
}: LineItemsTableProps) {
  const addItem = () => {
    // A new line copies the previous line's SAC: one service code per invoice is the norm.
    const sac = items[items.length - 1]?.sac;
    onChange([...items, { id: crypto.randomUUID(), description: "", amount: 0, tax: 0, sac }]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // Rate and quantity both re-derive `amount`, the line total every other screen reads.
  const updatePricing = (id: string, patch: { rate?: number; quantity?: number }) => {
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const rate = patch.rate ?? lineRate(item);
        const quantity = patch.quantity ?? lineQuantity(item);
        return { ...item, rate, quantity, amount: lineAmount(quantity, rate) };
      })
    );
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
        <span className="flex-[1_1_120px]">Item</span>
        <span className="flex-[0_0_84px]">SAC</span>
        <span className="flex-[0_0_56px]">Qty</span>
        <span className="flex-[0_0_120px]">Rate</span>
        <span className="flex-[0_0_64px]">Tax %</span>
        <span className="w-6 shrink-0" />
      </div>

      {items.map((item) => (
        <div key={item.id} className="flex gap-2 items-start px-3 py-2 border-b">
          {/* Grows with its content; Enter adds a line break that the invoice and PDF keep. */}
          <Textarea
            value={item.description}
            onChange={(e) => updateItem(item.id, "description", e.target.value)}
            placeholder="What did you do?"
            rows={1}
            className="flex-[1_1_120px] min-h-8 py-1.5 text-sm resize-none"
          />
          <Input
            value={item.sac ?? ""}
            onChange={(e) => updateItem(item.id, "sac", e.target.value)}
            placeholder="998314"
            aria-label="SAC code"
            className="flex-[0_0_84px] h-8 text-sm tabular-nums"
          />
          <Input
            type="number"
            value={lineQuantity(item) || ""}
            onChange={(e) => updatePricing(item.id, { quantity: parseFloat(e.target.value) || 0 })}
            placeholder="1"
            aria-label="Quantity"
            className="flex-[0_0_56px] h-8 text-sm tabular-nums"
            min={0}
          />
          <div className="flex-[0_0_120px] flex items-center gap-1">
            <span className="text-muted-foreground text-[13px]">{getCurrencySymbol(currency)}</span>
            <Input
              type="number"
              value={lineRate(item) || ""}
              onChange={(e) => updatePricing(item.id, { rate: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              aria-label="Rate"
              className="h-8 text-sm tabular-nums"
              min={0}
            />
          </div>
          <Input
            type="number"
            value={item.tax || ""}
            onChange={(e) => updateItem(item.id, "tax", parseFloat(e.target.value) || 0)}
            placeholder="0"
            aria-label="Tax %"
            className="flex-[0_0_64px] h-8 text-sm tabular-nums"
            min={0}
            max={100}
            disabled={taxDisabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 mt-1 text-muted-foreground hover:text-destructive"
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
