"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import { Invoice, Brand } from "@/lib/types";
import { getCurrencySymbol, formatCurrencyAmount } from "@/lib/utils";
import { format } from "date-fns";

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

// Noto Sans is registered solely for currency amounts — JetBrains Mono lacks the
// ₹ glyph, causing it to render as a corrupt character in react-pdf.
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  brandSection: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  logo: { width: 32, height: 32, objectFit: "contain" },
  brandName: { fontSize: 11, fontWeight: 700 },
  brandDetail: { fontSize: 7, color: "#666", marginTop: 1 },
  invoiceTitle: { fontSize: 16, fontWeight: 700, letterSpacing: 2 },
  invoiceNumber: { fontSize: 10, fontWeight: 700, marginTop: 2, textAlign: "right" },
  separator: { borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0", marginVertical: 12 },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  label: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2, fontWeight: 700 },
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
  colDesc: { flex: 1 },
  colAmount: { width: 80, textAlign: "right" },
  colTax: { width: 60, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  totalsLabel: { fontSize: 9, color: "#666", width: 80 },
  totalsValue: { fontSize: 9, width: 80, textAlign: "right" },
  totalsBold: { fontSize: 11, fontWeight: 700, width: 80, textAlign: "right" },
  totalsBoldLabel: { fontSize: 11, fontWeight: 700, width: 80 },
  bankColumns: { flexDirection: "row", justifyContent: "space-between" },
  bankColumn: { width: "48%" },
  bankRow: { flexDirection: "row", marginBottom: 3 },
  bankLabel: { fontSize: 8, color: "#888", width: 80 },
  bankValue: { fontSize: 8 },
  notes: { fontSize: 8, color: "#666", lineHeight: 1.5 },
});

interface InvoicePDFProps {
  invoice: Invoice;
  brand: Brand;
}

export function InvoicePDF({ invoice, brand }: InvoicePDFProps) {
  const cur = invoice.currency ?? "INR";
  const symbol = getCurrencySymbol(cur);
  const fmtAmount = (n: number) => formatCurrencyAmount(n, cur);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.brandSection}>
            {brand.logo && <Image src={brand.logo} style={s.logo} />}
            <View>
              <Text style={s.brandName}>{brand.name}</Text>
              <Text style={s.brandDetail}>{brand.address}</Text>
              {brand.phone && (
                <Text style={s.brandDetail}>{brand.phone}</Text>
              )}
              {brand.gstNumber && (
                <Text style={s.brandDetail}>GST: {brand.gstNumber}</Text>
              )}
              <Text style={[s.brandDetail, { marginTop: 4 }]}>
                <Text style={{ fontWeight: 700 }}>Email: </Text>
                {brand.email}
              </Text>
              {brand.panNumber && (
                <Text style={[s.brandDetail, { marginTop: 4 }]}>
                  <Text style={{ fontWeight: 700 }}>PAN: </Text>
                  {brand.panNumber}
                </Text>
              )}
            </View>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        <View style={s.separator} />

        {/* Dates + Client */}
        <View style={[s.row, { marginBottom: 16 }]}>
          <View style={s.col}>
            <View style={{ marginBottom: 8 }}>
              <Text style={s.label}>Bill Date</Text>
              <Text style={s.value}>
                {format(new Date(invoice.billDate), "dd MMM yyyy")}
              </Text>
            </View>
            <View>
              <Text style={s.label}>Due Date</Text>
              <Text style={s.value}>
                {format(new Date(invoice.dueDate), "dd MMM yyyy")}
              </Text>
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Billed To</Text>
            <Text style={[s.value, { fontWeight: 700 }]}>
              {invoice.client.companyName}
            </Text>
            {invoice.client.name && (
              <Text style={s.value}>{invoice.client.name}</Text>
            )}
            {invoice.client.address && (
              <Text style={[s.value, { color: "#666" }]}>
                {invoice.client.address}
              </Text>
            )}
            {invoice.client.gstNumber && (
              <Text style={[s.brandDetail, { marginTop: 2 }]}>
                GST: {invoice.client.gstNumber}
              </Text>
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
              <Text style={s.colAmount}>
                <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>{fmtAmount(item.amount)}
              </Text>
              <Text style={[s.colTax, { color: "#888" }]}>{item.tax}%</Text>
              <Text style={s.colTotal}>
                <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>{fmtAmount(item.amount + taxAmt)}
              </Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={{ marginTop: 12, alignItems: "flex-end" }}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Text style={s.totalsValue}>
              <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>{fmtAmount(invoice.subtotal)}
            </Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Tax</Text>
            <Text style={s.totalsValue}>
              <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>{fmtAmount(invoice.totalTax)}
            </Text>
          </View>
          <View
            style={[s.separator, { width: 160, marginVertical: 4 }]}
          />
          <View style={s.totalsRow}>
            <Text style={s.totalsBoldLabel}>Total</Text>
            <Text style={s.totalsBold}>
              <Text style={{ fontFamily: "Noto Sans" }}>{symbol}</Text>{fmtAmount(invoice.total)}
            </Text>
          </View>
        </View>

        <View style={[s.separator, { marginTop: 20 }]} />

        {/* Bank Details */}
        <View>
          <Text style={[s.label, { marginBottom: 6 }]}>Payment Details</Text>
          <View style={s.bankColumns}>
            {/* Left column: Account Name, Bank, Branch */}
            <View style={s.bankColumn}>
              <View style={s.bankRow}>
                <Text style={s.bankLabel}>Account Name</Text>
                <Text style={s.bankValue}>
                  {brand.bankDetails.accountName}
                </Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankLabel}>Bank</Text>
                <Text style={s.bankValue}>{brand.bankDetails.bankName}</Text>
              </View>
              {brand.bankDetails.branch && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Branch</Text>
                  <Text style={s.bankValue}>{brand.bankDetails.branch}</Text>
                </View>
              )}
            </View>
            {/* Right column: Account Number, IFSC, UPI */}
            <View style={s.bankColumn}>
              <View style={s.bankRow}>
                <Text style={s.bankLabel}>Account No.</Text>
                <Text style={s.bankValue}>
                  {brand.bankDetails.accountNumber}
                </Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankLabel}>IFSC</Text>
                <Text style={s.bankValue}>{brand.bankDetails.ifscCode}</Text>
              </View>
              {brand.bankDetails.upiId && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>UPI</Text>
                  <Text style={s.bankValue}>{brand.bankDetails.upiId}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

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
