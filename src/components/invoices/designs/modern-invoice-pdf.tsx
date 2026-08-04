"use client";

import "./pdf-fonts";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  // Aliased on import: eslint-config-next maps any JSX element literally
  // named `Image` to `jsx-a11y/alt-text`'s `img` check (so next/image usage
  // gets alt-text linting), but this is @react-pdf/renderer's own `Image`
  // primitive for the generated PDF document — an unrelated component that
  // doesn't take or render an HTML `alt` attribute at all. The rename avoids
  // the name collision rather than suppressing the (otherwise-correct) rule.
  Image as PdfImage,
} from "@react-pdf/renderer";
import { getCurrencySymbol, formatCurrencyAmount } from "@/lib/utils";
import { formatStoredDate } from "@/lib/dates";
import { chunkPaymentFieldRows, paymentDetailFields, taxLabel } from "@/lib/invoice-preview";
import type { Invoice } from "@/lib/types";
import type { InvoicePDFProps } from "./props";

// Neutral palette lifted from the app's light-theme CSS variables
// (src/app/globals.css :root) — the PDF always renders on white, regardless
// of the viewer's app theme, so only the light values apply here.
const color = {
  foreground: "#1a1a1a",
  mutedForeground: "#737373",
  border: "#e5e5e5",
  muted: "#f5f5f5",
  primary: "#262626",
  primaryForeground: "#fafafa",
  accent: "#ececec",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans",
    fontSize: 9,
    padding: 40,
    color: color.foreground,
    backgroundColor: "#ffffff",
  },
  mono: { fontFamily: "JetBrains Mono" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  brandSection: { flexDirection: "row", alignItems: "flex-start", gap: 8, minWidth: 0 },
  logo: { width: 28, height: 28, borderRadius: 6, objectFit: "contain" },
  logoFallback: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: color.primaryForeground, fontSize: 12, fontWeight: 700 },
  brandName: { fontSize: 10.5, fontWeight: 700 },
  brandAddress: { fontSize: 8, color: color.mutedForeground, marginTop: 2, lineHeight: 1.5, maxWidth: 230 },
  brandComplianceGroup: { marginTop: 3 },
  brandCompliance: { fontSize: 8, color: color.mutedForeground },
  headerRight: { alignItems: "flex-end" },
  eyebrow: { fontSize: 7, color: color.mutedForeground, textTransform: "uppercase", letterSpacing: 1 },
  invoiceNumber: { fontSize: 9.5, marginTop: 3 },
  paidPill: {
    marginTop: 8,
    backgroundColor: color.accent,
    color: color.primary,
    fontSize: 7.5,
    fontWeight: 700,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Parties
  parties: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, gap: 16 },
  partyLabel: { fontSize: 8, color: color.mutedForeground, marginBottom: 3 },
  billedToName: { fontSize: 9.5, fontWeight: 700 },
  billedToContact: { fontSize: 8, color: color.mutedForeground, marginTop: 2 },
  billedToAddress: { fontSize: 8, color: color.mutedForeground, marginTop: 2, lineHeight: 1.5, maxWidth: 260 },
  billedToCompliance: { fontSize: 8, color: color.mutedForeground, marginTop: 3 },
  datesRight: { alignItems: "flex-end" },
  dateValue: { fontSize: 9.5, marginBottom: 6 },

  // Line items
  ruleStrong: { borderBottomWidth: 1, borderBottomColor: color.foreground, marginBottom: 2 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    gap: 12,
  },
  itemDescription: { flex: 1, fontSize: 9.5 },
  itemTaxNote: { fontSize: 8, color: color.mutedForeground },
  itemAmount: { fontSize: 9.5 },

  // Totals
  totals: { borderTopWidth: 0.5, borderTopColor: color.border, marginTop: 2, paddingTop: 8, gap: 4 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  totalsLabel: { fontSize: 9, color: color.mutedForeground },
  totalsValue: { fontSize: 9 },
  totalDueRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  totalDueLabel: { fontSize: 12, fontWeight: 700 },
  totalDueValue: { fontSize: 12, fontWeight: 700 },

  // Payment details
  paymentBlock: { borderWidth: 0.5, borderColor: color.border, borderRadius: 8, marginTop: 24, overflow: "hidden" },
  paymentHeaderStrip: {
    backgroundColor: color.muted,
    borderBottomWidth: 0.5,
    borderBottomColor: color.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentHeaderText: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: color.mutedForeground,
  },
  paymentRow: { flexDirection: "row" },
  paymentRowDivider: { borderTopWidth: 0.5, borderTopColor: color.border },
  paymentCell: { flex: 1, padding: 8 },
  paymentCellDivider: { borderRightWidth: 0.5, borderRightColor: color.border },
  paymentCellFull: { width: "100%", padding: 8 },
  paymentLabel: { fontSize: 7.5, color: color.mutedForeground },
  paymentValue: { fontSize: 8.5, fontWeight: 700, marginTop: 2 },

  // Notes
  notes: { fontSize: 8, color: color.mutedForeground, lineHeight: 1.6, marginTop: 20 },
});

// Derived from our own StyleSheet rather than react-pdf's exported types:
// `Text`'s `style` prop type is a union that also covers its (unused here)
// SVG overload, which is broader than what a plain object literal satisfies.
type TextStyle = (typeof s)[keyof typeof s];

/** Renders an amount with the currency symbol swapped to a face that has the
 * glyph (JetBrains Mono lacks ₹), inside a tabular-number-friendly mono run. */
function Amount({ n, currency, style }: { n: number; currency: Invoice["currency"]; style?: TextStyle }) {
  const symbol = getCurrencySymbol(currency ?? "INR");
  return (
    <Text style={style ? [s.mono, style] : s.mono}>
      <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>
      {formatCurrencyAmount(n, currency ?? "INR")}
    </Text>
  );
}

/**
 * "Modern" PDF — the design this branch shipped with, and the default for
 * every brand. See `ClassicInvoicePDF` for the other design; both share
 * their money maths and payment-field logic from `@/lib/invoice-preview`
 * rather than duplicating it.
 */
export function ModernInvoicePDF({ invoice, snapshot }: InvoicePDFProps) {
  const cur = invoice.currency ?? "INR";
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
              <Text style={s.brandAddress}>{snapshot.address}</Text>
              {(snapshot.gstNumber || snapshot.panNumber) && (
                <View style={s.brandComplianceGroup}>
                  {snapshot.gstNumber && (
                    <Text style={s.brandCompliance}>GST: {snapshot.gstNumber}</Text>
                  )}
                  {snapshot.panNumber && (
                    <Text style={s.brandCompliance}>PAN: {snapshot.panNumber}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.eyebrow}>Invoice</Text>
            <Text style={[s.mono, s.invoiceNumber]}>{invoice.invoiceNumber}</Text>
            {isPaid && <Text style={s.paidPill}>Paid</Text>}
          </View>
        </View>

        {/* Parties */}
        <View style={s.parties}>
          <View style={{ minWidth: 0 }}>
            <Text style={s.partyLabel}>Billed to</Text>
            <Text style={s.billedToName}>{invoice.client.companyName}</Text>
            {invoice.client.name && (
              <Text style={s.billedToContact}>{invoice.client.name}</Text>
            )}
            <Text style={s.billedToAddress}>{invoice.client.address}</Text>
            {invoice.client.gstNumber && (
              <Text style={s.billedToCompliance}>GST: {invoice.client.gstNumber}</Text>
            )}
          </View>
          <View style={s.datesRight}>
            <Text style={s.partyLabel}>Bill date</Text>
            <Text style={[s.mono, s.dateValue]}>
              {formatStoredDate(invoice.billDate, "dd MMM yyyy")}
            </Text>
            <Text style={s.partyLabel}>Due date</Text>
            <Text style={[s.mono, s.dateValue, { marginBottom: 0 }]}>
              {formatStoredDate(invoice.dueDate, "dd MMM yyyy")}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={s.ruleStrong} />
        {invoice.items.map((item) => (
          <View key={item.id} style={s.itemRow}>
            <Text style={s.itemDescription}>
              {item.description}
              {item.tax > 0 && <Text style={s.itemTaxNote}> · {item.tax}% tax</Text>}
            </Text>
            <Amount n={item.amount} currency={cur} style={s.itemAmount} />
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Amount n={invoice.subtotal} currency={cur} style={s.totalsValue} />
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>{taxLabel(invoice.items)}</Text>
            <Amount n={invoice.totalTax} currency={cur} style={s.totalsValue} />
          </View>
          <View style={s.totalDueRow}>
            <Text style={s.totalDueLabel}>Total due</Text>
            <Amount n={invoice.total} currency={cur} style={s.totalDueValue} />
          </View>
        </View>

        {/* Payment details */}
        {rows.length > 0 && (
          <View style={s.paymentBlock}>
            <View style={s.paymentHeaderStrip}>
              <Text style={s.paymentHeaderText}>Payment details</Text>
            </View>
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
        )}

        {/* Notes */}
        {invoice.notes && <Text style={s.notes}>{invoice.notes}</Text>}
      </Page>
    </Document>
  );
}
