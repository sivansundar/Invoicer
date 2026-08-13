import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { computeTotals, paymentDetailFields, taxLabel } from "@/lib/invoice-preview";
import { formatCurrency } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import { BrandLogo } from "@/components/brands/brand-logo";
import type { InvoicePreviewProps } from "./props";

function formatDate(value: string): string {
  return formatStoredDate(value, "dd MMM yyyy");
}

/**
 * "Classic" on-screen invoice — the tabular tax-invoice layout that shipped
 * on `main` before this branch's rewrite, ported here rather than
 * re-implemented from memory. Selectable per brand as an alternative to
 * `ModernInvoicePreview`; both share their money maths and payment-field
 * logic from `@/lib/invoice-preview`.
 */
export function ClassicInvoicePreview({
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
  const fmt = (n: number) => formatCurrency(n, currency, 2);

  return (
    <div className="max-w-3xl mx-auto bg-card border border-border rounded-lg p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <BrandLogo
            source={snapshot}
            name={snapshot.name}
            className="h-10 w-10 object-contain"
            fallbackClassName="h-10 w-10 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0"
          />
          <div>
            <h2 className="text-sm font-bold">{snapshot.name}</h2>
            <p className="text-[10px] text-muted-foreground whitespace-pre-line">
              {snapshot.address}
            </p>
            {snapshot.email && (
              <p className="text-[10px] text-muted-foreground">{snapshot.email}</p>
            )}
            {snapshot.gstNumber && (
              <p className="text-[10px] text-muted-foreground">GST: {snapshot.gstNumber}</p>
            )}
            {snapshot.panNumber && (
              <p className="text-[10px] text-muted-foreground">PAN: {snapshot.panNumber}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-bold uppercase tracking-wider">Invoice</h1>
          <p className="text-sm font-medium tabular-nums mt-1">{invoiceNumber}</p>
          {isPaid && (
            <Badge variant="secondary" className="mt-1.5">
              Paid
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Dates + Client */}
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
              Bill Date
            </p>
            <p className="text-xs tabular-nums">{formatDate(billDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
              Due Date
            </p>
            <p className="text-xs tabular-nums">{formatDate(dueDate)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1">
            Billed To
          </p>
          <p className="text-xs font-medium">{client.companyName}</p>
          {client.name && (
            <p className="text-xs text-muted-foreground">{client.name}</p>
          )}
          {client.address && (
            <p className="text-xs text-muted-foreground whitespace-pre-line">
              {client.address}
            </p>
          )}
          {client.gstNumber && (
            <p className="text-[10px] text-muted-foreground mt-1">GST: {client.gstNumber}</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Line Items */}
      <div>
        <div className="grid grid-cols-[1fr_100px_80px_100px] gap-2 text-xs uppercase tracking-wider text-muted-foreground font-bold pb-2 border-b border-border">
          <span>Description</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Tax</span>
          <span className="text-right">Total</span>
        </div>
        {items.map((item) => {
          const taxAmount = (item.amount * item.tax) / 100;
          return (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_100px_80px_100px] gap-2 py-2.5 border-b border-border/50 text-xs"
            >
              <span className="min-w-0 break-words">{item.description}</span>
              <span className="text-right tabular-nums">{fmt(item.amount)}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {item.tax}%
              </span>
              <span className="text-right tabular-nums">{fmt(item.amount + taxAmount)}</span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{taxLabel(items)}</span>
            <span className="tabular-nums">{fmt(totalTax)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-sm">
            <span>Total</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* Payment details — only when at least one bank field is populated,
          listing only populated fields in `PAYMENT_FIELD_ORDER`, with a lone
          trailing field spanning the full width. */}
      {fields.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
              Payment Details
            </p>
            <div className="grid grid-cols-2 border-t border-l border-border text-xs">
              {fields.map((field, index) => {
                const isLoneLast = index === fields.length - 1 && fields.length % 2 === 1;
                return (
                  <div
                    key={field.label}
                    className={`border-b border-r border-border px-3 py-2 ${isLoneLast ? "col-span-2" : ""}`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {field.label}
                    </p>
                    <p className="font-medium tabular-nums break-words">{field.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Notes */}
      {notes && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-line break-words">
              {notes}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
