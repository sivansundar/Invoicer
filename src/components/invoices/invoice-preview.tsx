import { computeTotals, paymentDetailFields, taxLabel } from "@/lib/invoice-preview";
import type { BrandSnapshot, Currency, InvoiceClient, LineItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";

interface InvoicePreviewProps {
  snapshot: BrandSnapshot;
  client: InvoiceClient;
  invoiceNumber: string;
  billDate: string;
  dueDate: string;
  items: LineItem[];
  currency: Currency;
  notes: string | undefined;
  isPaid: boolean;
}

function formatDate(value: string): string {
  return formatStoredDate(value, "dd MMM yyyy");
}

export function InvoicePreview({
  snapshot,
  client,
  invoiceNumber,
  billDate,
  dueDate,
  items,
  currency,
  notes,
  isPaid,
}: InvoicePreviewProps) {
  const { subtotal, totalTax, total } = computeTotals(items);
  const fields = paymentDetailFields(snapshot.bankDetails);

  return (
    <div className="bg-card border rounded-[14px] shadow-lg p-8 max-w-[460px] box-border">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-start gap-3 min-w-0">
          {snapshot.logo ? (
            <img
              src={snapshot.logo}
              alt={snapshot.name}
              className="w-8 h-8 rounded-lg object-contain shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
              {snapshot.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{snapshot.name}</p>
            <p className="text-xs text-muted-foreground leading-[1.5] max-w-[190px] whitespace-pre-line break-words">
              {snapshot.address}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground tracking-[0.06em] uppercase">Invoice</p>
          <p className="font-mono text-sm mt-0.5">{invoiceNumber}</p>
          {isPaid && (
            <span className="inline-block mt-2 bg-accent text-foreground text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              Paid
            </span>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="flex justify-between gap-4 mb-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">Billed to</p>
          <p className="text-[13px] font-medium">{client.companyName}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-line break-words">
            {client.address}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Bill date</p>
          <p className="text-[13px] tabular-nums mb-1.5">{formatDate(billDate)}</p>
          <p className="text-xs text-muted-foreground">Due date</p>
          <p className="text-[13px] tabular-nums">{formatDate(dueDate)}</p>
        </div>
      </div>

      {/* Line items */}
      <div className="border-t border-foreground pt-2.5">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-3 py-1.5 text-[13px]">
            <span className="min-w-0 break-words">
              {item.description}
              {item.tax > 0 && (
                <span className="text-muted-foreground text-xs"> · {item.tax}% tax</span>
              )}
            </span>
            <span className="tabular-nums shrink-0">{formatCurrency(item.amount, currency)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t mt-2.5 pt-2.5 flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">{taxLabel(items)}</span>
          <span className="tabular-nums">{formatCurrency(totalTax, currency)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold mt-0.5">
          <span>Total due</span>
          <span className="tabular-nums">{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {/* Payment details */}
      {fields.length > 0 && (
        <div className="border rounded-lg mt-5 overflow-hidden">
          <div className="bg-muted border-b px-3 py-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase text-muted-foreground">
            Payment details
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            {fields.map((field) => (
              <div key={field.label} className="bg-card px-3 py-1.5 text-xs">
                <p className="text-[11px] text-muted-foreground">{field.label}</p>
                <p className="font-medium tabular-nums break-words">{field.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && <p className="text-xs text-muted-foreground mt-3 whitespace-pre-line break-words">{notes}</p>}
    </div>
  );
}
