"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { Invoice, Currency } from "@/lib/types";
import { getCurrencySymbol, formatCurrencyAmount } from "@/lib/utils";
import {
  ReportSummary,
  groupByCurrency,
} from "@/lib/reports";
import { effectiveStatus } from "@/lib/dashboard";
import { formatStoredDate } from "@/lib/dates";

// Reuse the same fonts registered by the invoice PDF. Registering again with the
// same family name is idempotent in react-pdf.
Font.register({
  family: "JetBrains Mono",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Bold.ttf",
      fontWeight: 700,
    },
  ],
});

// Noto Sans carries the ₹ glyph that JetBrains Mono lacks.
Font.register({
  family: "Noto Sans",
  fonts: [
    { src: "/fonts/NotoSans-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSans-Bold.ttf", fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: {
    fontFamily: "JetBrains Mono",
    fontSize: 9,
    padding: 40,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },
  header: { marginBottom: 20 },
  senderName: { fontSize: 13, fontWeight: 700 },
  senderAddress: { fontSize: 8, color: "#666", marginTop: 2, maxWidth: "70%" },
  title: { fontSize: 16, fontWeight: 700, letterSpacing: 2 },
  subtitle: { fontSize: 9, color: "#666", marginTop: 4 },
  metaLine: { fontSize: 8, color: "#888", marginTop: 2 },
  separator: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    marginVertical: 12,
  },
  label: {
    fontSize: 7,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: 700,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryBox: { flex: 1 },
  statValue: { fontSize: 14, fontWeight: 700 },
  statLabel: { fontSize: 7, color: "#888", marginTop: 2 },
  currencyLine: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  statusLine: { fontSize: 8, color: "#666" },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 7,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  colNumber: { width: 90 },
  colDate: { width: 70 },
  colClient: { flex: 1 },
  colStatus: { width: 60, textTransform: "capitalize" },
  colTotal: { width: 90, textAlign: "right" },
  groupHeader: {
    fontSize: 8,
    fontWeight: 700,
    color: "#666",
    marginTop: 12,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
    marginTop: 2,
  },
  subtotalLabel: { fontSize: 9, fontWeight: 700, marginRight: 12 },
  subtotalValue: { fontSize: 9, fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 7,
    color: "#aaa",
  },
});

const CURRENCY_NAME: Record<Currency, string> = {
  INR: "Indian Rupee",
  USD: "US Dollar",
  SGD: "Singapore Dollar",
};

interface SummaryReportPDFProps {
  invoices: Invoice[];
  summary: ReportSummary;
  periodLabel: string; // e.g. "FY 2025-26 · April – March"
  senderName: string; // brand name or "All Brands"
  senderAddress?: string; // brand address (omitted for "All Brands")
  generatedOn: string; // formatted date string
}

function Amount({ currency, value, bold }: { currency: Currency; value: number; bold?: boolean }) {
  return (
    <Text>
      <Text style={{ fontFamily: "Noto Sans", fontWeight: bold ? 700 : 400 }}>
        {getCurrencySymbol(currency)}
      </Text>
      {formatCurrencyAmount(value, currency)}
    </Text>
  );
}

export function SummaryReportPDF({
  invoices,
  summary,
  periodLabel,
  senderName,
  senderAddress,
  generatedOn,
}: SummaryReportPDFProps) {
  const groups = groupByCurrency(invoices);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.senderName}>{senderName}</Text>
          {senderAddress ? (
            <Text style={s.senderAddress}>{senderAddress}</Text>
          ) : null}
          <Text style={[s.title, { marginTop: 14 }]}>FINANCIAL YEAR SUMMARY</Text>
          <Text style={s.subtitle}>{periodLabel}</Text>
          <Text style={s.metaLine}>Generated {generatedOn}</Text>
        </View>

        <View style={s.separator} />

        {/* Summary block */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.label}>Invoices</Text>
            <Text style={s.statValue}>{summary.count}</Text>
          </View>
          <View style={[s.summaryBox, { flex: 1.4 }]}>
            <Text style={s.label}>Totals</Text>
            {summary.totalsByCurrency.length === 0 ? (
              <Text style={s.statusLine}>—</Text>
            ) : (
              summary.totalsByCurrency.map((t) => (
                <Text key={t.currency} style={s.currencyLine}>
                  <Amount currency={t.currency} value={t.total} bold />
                  <Text style={{ fontSize: 7, color: "#888", fontWeight: 400 }}>
                    {"  "}({t.count} {t.count === 1 ? "invoice" : "invoices"})
                  </Text>
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={s.separator} />

        {/* Invoice table, grouped by currency */}
        {groups.length === 0 ? (
          <Text style={s.statusLine}>No invoices in this period.</Text>
        ) : (
          groups.map((group) => {
            const groupTotal = group.invoices.reduce((sum, i) => sum + i.total, 0);
            return (
              <View key={group.currency} wrap={false}>
                <Text style={s.groupHeader}>
                  {group.currency} — {CURRENCY_NAME[group.currency]}
                </Text>
                <View style={s.tableHeader}>
                  <Text style={[s.tableHeaderText, s.colNumber]}>Invoice #</Text>
                  <Text style={[s.tableHeaderText, s.colDate]}>Date</Text>
                  <Text style={[s.tableHeaderText, s.colClient]}>Client</Text>
                  <Text style={[s.tableHeaderText, s.colStatus]}>Status</Text>
                  <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
                </View>
                {group.invoices.map((inv) => (
                  <View key={inv.id} style={s.tableRow}>
                    <Text style={s.colNumber}>{inv.invoiceNumber}</Text>
                    <Text style={s.colDate}>
                      {formatStoredDate(inv.billDate, "dd MMM yy")}
                    </Text>
                    <Text style={s.colClient}>{inv.client.companyName}</Text>
                    {/* effectiveStatus, not the raw stored status — an
                        invoice included here because the Overdue checkbox
                        was ticked must not print "sent" in its own row. */}
                    <Text style={[s.colStatus, { color: "#666" }]}>{effectiveStatus(inv)}</Text>
                    <Text style={s.colTotal}>
                      <Amount currency={group.currency} value={inv.total} />
                    </Text>
                  </View>
                ))}
                <View style={s.subtotalRow}>
                  <Text style={s.subtotalLabel}>Subtotal {group.currency}</Text>
                  <Text style={s.subtotalValue}>
                    <Amount currency={group.currency} value={groupTotal} bold />
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <Text style={s.footer} fixed>
          {senderName} · {periodLabel}
        </Text>
      </Page>
    </Document>
  );
}
