"use client";

import "./pdf-fonts";
import { Document, Page, Text, View, StyleSheet, Image as PdfImage } from "@react-pdf/renderer";
import { getCurrencySymbol, formatCurrencyAmount } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import { chunkPaymentFieldRows, paymentDetailFields, taxLabel } from "@/lib/invoice-preview";
import type { InvoicePDFProps } from "./props";

const s = StyleSheet.create({
  page: {
    fontFamily: "JetBrains Mono",
    fontSize: 9,
    padding: 40,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  brandSection: { flexDirection: "row", alignItems: "flex-start", gap: 8, minWidth: 0 },
  logo: { width: 32, height: 32, objectFit: "contain" },
  logoFallback: {
    width: 32,
    height: 32,
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: "#fafafa", fontFamily: "Noto Sans", fontSize: 13, fontWeight: 700 },
  brandName: { fontSize: 11, fontWeight: 700 },
  brandDetail: { fontSize: 7, color: "#666", marginTop: 1 },
  invoiceTitle: { fontSize: 16, fontWeight: 700, letterSpacing: 2 },
  invoiceNumber: { fontSize: 10, fontWeight: 700, marginTop: 2, textAlign: "right" },
  paidPill: {
    marginTop: 6,
    alignSelf: "flex-end",
    borderWidth: 0.5,
    borderColor: "#1a1a1a",
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  separator: { borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0", marginVertical: 12 },
  row: { flexDirection: "row" },
  col: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 7,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
    fontWeight: 700,
  },
  value: { fontSize: 9 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderText: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  colDesc: { flex: 1, minWidth: 0 },
  colAmount: { width: 100, textAlign: "right" },
  colTax: { width: 70, textAlign: "right" },
  colTotal: { width: 100, textAlign: "right" },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  totalsLabel: { fontSize: 9, color: "#666", width: 80 },
  totalsValue: { fontSize: 9, width: 160, textAlign: "right" },
  totalsBold: { fontSize: 11, fontWeight: 700, width: 160, textAlign: "right" },
  totalsBoldLabel: { fontSize: 11, fontWeight: 700, width: 80 },

  // Payment details — a bordered table rather than the two static columns
  // `main` used, so it can render the shared, order-preserving
  // `paymentDetailFields`/`chunkPaymentFieldRows` output (only populated
  // fields, lone trailing field spanning the full row) the same way the
  // modern PDF does.
  paymentBlock: { borderWidth: 0.5, borderColor: "#ccc", marginTop: 6 },
  paymentRow: { flexDirection: "row" },
  paymentRowDivider: { borderTopWidth: 0.5, borderTopColor: "#e0e0e0" },
  paymentCell: { flex: 1, padding: 7 },
  paymentCellDivider: { borderRightWidth: 0.5, borderRightColor: "#e0e0e0" },
  paymentCellFull: { width: "100%", padding: 7 },
  paymentLabel: { fontSize: 7, color: "#888" },
  paymentValue: { fontSize: 8.5, fontWeight: 700, marginTop: 2 },

  notes: { fontSize: 8, color: "#666", lineHeight: 1.5 },
});

/** Renders an amount with the currency symbol swapped to a face that has the
 * glyph (JetBrains Mono lacks ₹), matching the modern PDF's `Amount` helper. */
function amountRun(n: number, currency: InvoicePDFProps["invoice"]["currency"]) {
  const symbol = getCurrencySymbol(currency ?? "INR");
  return (
    <>
      <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>
      {formatCurrencyAmount(n, currency ?? "INR")}
    </>
  );
}

/**
 * "Classic" PDF — the tabular tax-invoice layout that shipped on `main`
 * before this branch's rewrite, ported here rather than re-implemented from
 * memory. Selectable per brand as an alternative to `ModernInvoicePDF`; both
 * share their money maths and payment-field logic from
 * `@/lib/invoice-preview` rather than duplicating it, and both read
 * exclusively from `invoice.brandSnapshot` — never a live brand lookup — so
 * editing a brand after an invoice was issued can never change the document
 * a client already received.
 */
export function ClassicInvoicePDF({ invoice, snapshot }: InvoicePDFProps) {
  const cur = invoice.currency ?? "INR";
  const symbol = getCurrencySymbol(cur);
  const fmtAmount = (n: number) => formatCurrencyAmount(n, cur);
  const isPaid = invoice.status === "paid";
  const fields = paymentDetailFields(snapshot.bankDetails);
  const rows = chunkPaymentFieldRows(fields);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.brandSection}>
            {snapshot.logo ? (
              <PdfImage src={snapshot.logo} style={s.logo} />
            ) : (
              <View style={s.logoFallback}>
                <Text style={s.logoFallbackText}>
                  {snapshot.name.trim().charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={{ minWidth: 0 }}>
              <Text style={s.brandName}>{snapshot.name}</Text>
              <Text style={s.brandDetail}>{snapshot.address}</Text>
              {snapshot.phone && <Text style={s.brandDetail}>{snapshot.phone}</Text>}
              {snapshot.gstNumber && (
                <Text style={s.brandDetail}>GST: {snapshot.gstNumber}</Text>
              )}
              {snapshot.email && (
                <Text style={[s.brandDetail, { marginTop: 4 }]}>
                  <Text style={{ fontWeight: 700 }}>Email: </Text>
                  {snapshot.email}
                </Text>
              )}
              {snapshot.panNumber && (
                <Text style={[s.brandDetail, { marginTop: 4 }]}>
                  <Text style={{ fontWeight: 700 }}>PAN: </Text>
                  {snapshot.panNumber}
                </Text>
              )}
            </View>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoice.invoiceNumber}</Text>
            {isPaid && <Text style={s.paidPill}>Paid</Text>}
          </View>
        </View>

        <View style={s.separator} />

        {/* Dates + Client */}
        <View style={[s.row, { marginBottom: 16 }]}>
          <View style={s.col}>
            <View style={{ marginBottom: 8 }}>
              <Text style={s.label}>Bill Date</Text>
              <Text style={s.value}>{formatStoredDate(invoice.billDate, "dd MMM yyyy")}</Text>
            </View>
            <View>
              <Text style={s.label}>Due Date</Text>
              <Text style={s.value}>{formatStoredDate(invoice.dueDate, "dd MMM yyyy")}</Text>
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Billed To</Text>
            <Text style={[s.value, { fontWeight: 700 }]}>{invoice.client.companyName}</Text>
            {invoice.client.name && <Text style={s.value}>{invoice.client.name}</Text>}
            {invoice.client.address && (
              <Text style={[s.value, { color: "#666" }]}>{invoice.client.address}</Text>
            )}
            {invoice.client.gstNumber && (
              <Text style={[s.brandDetail, { marginTop: 2 }]}>GST: {invoice.client.gstNumber}</Text>
            )}
          </View>
        </View>

        <View style={s.separator} />

        {/* Line Items Table */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colDesc]}>Description</Text>
          <Text style={[s.tableHeaderText, s.colAmount]}>Amount</Text>
          <Text style={[s.tableHeaderText, s.colTax]}>Tax</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
        </View>
        {invoice.items.map((item) => {
          const taxAmt = (item.amount * item.tax) / 100;
          return (
            <View key={item.id} style={s.tableRow}>
              <Text style={s.colDesc}>{item.description}</Text>
              <Text style={s.colAmount}>{amountRun(item.amount, cur)}</Text>
              <Text style={[s.colTax, { color: "#888" }]}>{item.tax}%</Text>
              <Text style={s.colTotal}>{amountRun(item.amount + taxAmt, cur)}</Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Text style={s.totalsValue}>{amountRun(invoice.subtotal, cur)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>{taxLabel(invoice.items)}</Text>
            <Text style={s.totalsValue}>{amountRun(invoice.totalTax, cur)}</Text>
          </View>
          <View style={[s.separator, { width: 240, marginVertical: 4 }]} />
          <View style={s.totalsRow}>
            <Text style={s.totalsBoldLabel}>Total</Text>
            <Text style={s.totalsBold}>
              <Text style={{ fontFamily: "Noto Sans", fontWeight: 700 }}>{symbol}</Text>
              {fmtAmount(invoice.total)}
            </Text>
          </View>
        </View>

        {/* Payment details */}
        {rows.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <View style={s.separator} />
            <Text style={[s.label, { marginBottom: 6 }]}>Payment Details</Text>
            <View style={s.paymentBlock}>
              {rows.map((row, rowIndex) => (
                <View
                  key={row.map((f) => f.label).join("|")}
                  style={rowIndex === 0 ? s.paymentRow : [s.paymentRow, s.paymentRowDivider]}
                >
                  {row.length === 2 ? (
                    <>
                      <View style={[s.paymentCell, s.paymentCellDivider]}>
                        <Text style={s.paymentLabel}>{row[0].label}</Text>
                        <Text style={s.paymentValue}>{row[0].value}</Text>
                      </View>
                      <View style={s.paymentCell}>
                        <Text style={s.paymentLabel}>{row[1].label}</Text>
                        <Text style={s.paymentValue}>{row[1].value}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={s.paymentCellFull}>
                      <Text style={s.paymentLabel}>{row[0].label}</Text>
                      <Text style={s.paymentValue}>{row[0].value}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={{ marginTop: 16 }}>
            <View style={s.separator} />
            <Text style={[s.label, { marginBottom: 4 }]}>Notes</Text>
            <Text style={s.notes}>{invoice.notes}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
