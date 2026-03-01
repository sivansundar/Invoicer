"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineItem, Currency } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

interface LineItemsTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: Currency;
}

export function LineItemsTable({ items, onChange, currency }: LineItemsTableProps) {
  const addItem = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: "",
        amount: 0,
        tax: 0,
      },
    ]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid grid-cols-[1fr_120px_80px_100px_32px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
        <span>Description</span>
        <span>Amount</span>
        <span>Tax %</span>
        <span className="text-right">Line Total</span>
        <span />
      </div>

      {/* Rows */}
      {items.map((item) => {
        const taxAmount = (item.amount * item.tax) / 100;
        const lineTotal = item.amount + taxAmount;
        return (
          <div
            key={item.id}
            className="grid grid-cols-[1fr_120px_80px_100px_32px] gap-2 items-center"
          >
            <Input
              value={item.description}
              onChange={(e) =>
                updateItem(item.id, "description", e.target.value)
              }
              placeholder="Development Services"
              className="text-sm h-9"
            />
            <Input
              type="number"
              value={item.amount || ""}
              onChange={(e) =>
                updateItem(item.id, "amount", parseFloat(e.target.value) || 0)
              }
              placeholder="0"
              className="text-sm h-9"
              min={0}
            />
            <Input
              type="number"
              value={item.tax || ""}
              onChange={(e) =>
                updateItem(item.id, "tax", parseFloat(e.target.value) || 0)
              }
              placeholder="0"
              className="text-sm h-9"
              min={0}
              max={100}
            />
            <span className="text-sm text-right tabular-nums">
              {formatCurrency(lineTotal, currency)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => removeItem(item.id)}
              disabled={items.length === 1}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={addItem}
      >
        <Plus className="h-3 w-3" />
        Add Line Item
      </Button>
    </div>
  );
}
