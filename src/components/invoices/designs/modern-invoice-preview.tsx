import { computeTotals, countryLine, lineQuantity, lineRate, paymentTerms, exportDeclaration, invoiceTitle, paymentDetailFields, placeOfSupply, taxRows } from "@/lib/invoice-preview";
import { formatCurrency, formatCurrencyAmount } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import type { InvoicePreviewProps } from "./props";

function formatDate(value: string): string {
  return formatStoredDate(value, "dd MMM yyyy");
}

/**
 * "Modern" on-screen invoice — the design this branch shipped with, and the
 * default for every brand. See `ClassicInvoicePreview` for the other design;
 * both share their money maths and payment-field logic from
 * `@/lib/invoice-preview` rather than duplicating it.
 */
export function ModernInvoicePreview({
  snapshot,
  client,
  invoiceNumber,
  billDate,
  dueDate,
  items,
  currency,
  notes,
  isPaid,
  paymentMethod,
  showAchAccountType,
  gstType,
  hideContactName,
}: InvoicePreviewProps) {
  const { subtotal, total } = computeTotals(items);
  const supply = placeOfSupply(gstType, client.stateCode);
  const fields = paymentDetailFields(snapshot.bankDetails, snapshot.achDetails, paymentMethod, showAchAccountType);

  return (
    // `mx-auto` for the same reason `ClassicInvoicePreview` has it: every pane
    // that hosts a preview is `flex-[1_1_508px]`, so it grows past this
    // document's max width on a wide window. Without it the two designs sit
    // differently in the identical pane — Modern pinned left, Classic centred.
    <div className="bg-card border rounded-[14px] shadow-lg p-8 max-w-[600px] mx-auto box-border">
      {/* Header: logo on its own line, brand details under it; title and invoice facts on the right. */}
      <div className="flex justify-between items-start gap-6">
        <div className="min-w-0">
          {snapshot.logo ? (
            <img
              src={snapshot.logo}
              alt={snapshot.name}
              className="w-12 h-12 rounded-xl object-contain"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold">
              {snapshot.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <p className="text-sm font-semibold mt-3">{snapshot.name}</p>
          <p className="text-xs text-muted-foreground leading-[1.5] max-w-[240px] whitespace-pre-line break-words">
            {snapshot.address}
          </p>
          {snapshot.gstNumber && (
            <p className="text-xs text-muted-foreground mt-0.5">GSTIN: {snapshot.gstNumber}</p>
          )}
          {snapshot.panNumber && (
            <p className="text-xs text-muted-foreground">PAN: {snapshot.panNumber}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tracking-tight">{invoiceTitle(gstType, snapshot.gstNumber)}</p>
          <dl className="mt-3 grid grid-cols-[auto_auto] justify-end gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Invoice #</dt>
            <dd className="font-mono font-medium">{invoiceNumber}</dd>
            <dt className="text-muted-foreground">Invoice date</dt>
            <dd className="font-medium tabular-nums">{formatDate(billDate)}</dd>
            <dt className="text-muted-foreground">Due date</dt>
            <dd className="font-medium tabular-nums">{formatDate(dueDate)}</dd>
            {paymentTerms(billDate, dueDate) && (
              <>
                <dt className="text-muted-foreground">Payment terms</dt>
                <dd className="font-medium">{paymentTerms(billDate, dueDate)}</dd>
              </>
            )}
          </dl>
          {isPaid && (
            <span className="inline-block mt-2 bg-accent text-foreground text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              Paid
            </span>
          )}
        </div>
      </div>

      <div className="border-t my-5" />

      {/* Bill to */}
      <div className="mb-5 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">Bill to</p>
        <p className="text-[13px] font-semibold">{client.companyName}</p>
        {client.name && !hideContactName && (
          <p className="text-xs text-muted-foreground">{client.name}</p>
        )}
        <p className="text-xs text-muted-foreground whitespace-pre-line break-words max-w-[300px]">
          {client.address}
        </p>
        {client.uen && (
          <p className="text-xs text-muted-foreground mt-1">UEN: {client.uen}</p>
        )}
        {client.gstNumber && (
          <p className="text-xs text-muted-foreground mt-1">GSTIN: {client.gstNumber}</p>
        )}
        {countryLine(gstType, client.country) && (
          <p className="text-xs text-muted-foreground mt-1">{countryLine(gstType, client.country)}</p>
        )}
        {supply && (
          <p className="text-xs text-muted-foreground mt-1">Place of supply: {supply}</p>
        )}
      </div>

      {/* Line items */}
      <table className="w-full border-t border-foreground text-[13px] table-fixed">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-[68px]" />
          <col className="w-10" />
          <col className="w-[92px]" />
          <col className="w-11" />
          <col className="w-[100px]" />
        </colgroup>
        <thead>
          <tr className="text-[11px] text-muted-foreground border-b">
            <th className="text-left font-medium py-2">#</th>
            <th className="text-left font-medium py-2">Item</th>
            <th className="text-left font-medium py-2">SAC</th>
            <th className="text-right font-medium py-2">Qty</th>
            <th className="text-right font-medium py-2">Rate ({currency})</th>
            <th className="text-right font-medium py-2">Tax</th>
            <th className="text-right font-medium py-2">Amount ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="border-b last:border-b-0 align-top">
              <td className="py-2 text-muted-foreground tabular-nums">{index + 1}.</td>
              <td className="py-2 pr-2 break-words">{item.description}</td>
              <td className="py-2 tabular-nums">{item.sac}</td>
              <td className="py-2 text-right tabular-nums">{lineQuantity(item)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrencyAmount(lineRate(item), currency)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{item.tax}%</td>
              <td className="py-2 text-right tabular-nums">{formatCurrencyAmount(item.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t mt-2.5 pt-2.5 flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
        </div>
        {taxRows(items, gstType).map((row) => (
          <div key={row.label} className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{formatCurrency(row.amount, currency)}</span>
          </div>
        ))}
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
            {fields.map((field, index) => {
              // A lone trailing field (odd total count) spans both columns
              // instead of leaving an empty cell beside it.
              const isLoneLast = index === fields.length - 1 && fields.length % 2 === 1;
              return (
                <div
                  key={field.label}
                  className={`bg-card px-3 py-1.5 text-xs ${isLoneLast ? "col-span-2" : ""}`}
                >
                  <p className="text-[11px] text-muted-foreground">{field.label}</p>
                  <p className="font-medium tabular-nums break-words">{field.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {gstType === "export_lut" && (
        <p className="text-[11px] text-muted-foreground mt-4">{exportDeclaration(snapshot.lutArn, snapshot.purposeCode)}</p>
      )}
      {notes && <p className="text-xs text-muted-foreground mt-3 whitespace-pre-line break-words">{notes}</p>}
    </div>
  );
}
