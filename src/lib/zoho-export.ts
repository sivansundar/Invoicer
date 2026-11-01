import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Invoice } from "./types";

// Zoho Books (India) invoice import template, column order as Zoho ships it.
const HEADERS = [
  "Invoice Number", "Estimate Number", "Invoice Date", "Invoice Status", "Customer Name",
  "GST Treatment", "TCS Tax Name", "TCS Percentage", "TCS Amount", "Nature Of Collection",
  "TCS Payable Account", "TCS Receivable Account", "GST Identification Number (GSTIN)", "TDS Name",
  "TDS Percentage", "TDS Section Code", "TDS Amount", "Place of Supply", "PurchaseOrder",
  "Expense Reference ID", "Payment Terms", "Payment Terms Label", "Due Date", "Expected Payment Date",
  "Sales person", "Shipping Charge Tax Name", "Shipping Charge Tax Type", "Shipping Charge Tax %",
  "Shipping Charge", "Shipping Charge Tax Exemption Code", "Shipping Charge SAC Code", "Currency Code",
  "Exchange Rate", "Account", "Item Name", "SKU", "Item Desc", "Item Type", "HSN/SAC", "Quantity",
  "Usage unit", "Item Price", "Item Tax Exemption Reason", "Is Inclusive Tax", "Item Tax",
  "Item Tax Type", "Item Tax %", "Reverse Charge Tax Name", "Reverse Charge Tax Rate",
  "Reverse Charge Tax Type", "Is Export Without LUT/Bond", "Tax Collected From Customer",
  "Project Name", "Supply Type", "Discount Type", "Is Discount Before Tax", "Entity Discount Percent",
  "Entity Discount Amount", "Discount", "Discount Amount", "Adjustment", "Adjustment Description",
  "E-Commerce Operator Name", "E-Commerce Operator GSTIN", "PayPal", "Razorpay", "Partial Payments",
  "Template Name", "Notes", "Terms & Conditions", "Branch Name", "Warehouse Name",
] as const;

type Header = (typeof HEADERS)[number];

// GSTIN state prefix → Zoho "Place of Supply" code.
// shortcut: codes outside KA/TN/MH/DL/etc. follow Zoho's list as best known; fix here if Zoho rejects one.
const GST_STATE: Record<string, string> = {
  "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UK", "06": "HR", "07": "DL", "08": "RJ",
  "09": "UP", "10": "BR", "11": "SK", "12": "AR", "13": "NL", "14": "MN", "15": "MZ", "16": "TR",
  "17": "ML", "18": "AS", "19": "WB", "20": "JH", "21": "OR", "22": "CT", "23": "MP", "24": "GJ",
  "26": "DN", "27": "MH", "29": "KA", "30": "GA", "31": "LD", "32": "KL", "33": "TN", "34": "PY",
  "35": "AN", "36": "TS", "37": "AP", "38": "LA",
};

const stateOf = (gstin?: string) => (gstin ? GST_STATE[gstin.trim().slice(0, 2)] : undefined);

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * One row per line item; Zoho groups rows into an invoice by Invoice Number.
 * Non-INR invoices are treated as exports of services under LUT (zero-rated IGST).
 */
export function toZohoCsv(invoices: Invoice[]): string {
  const rows = invoices.flatMap((inv) => {
    const overseas = inv.currency !== "INR";
    const clientGstin = inv.client.gstNumber?.trim() || undefined;
    // shortcut: an Indian client without a GSTIN is assumed to be in the brand's own state.
    const placeOfSupply = overseas ? "" : stateOf(clientGstin) ?? stateOf(inv.brandSnapshot.gstNumber) ?? "";
    const intraState = !overseas && placeOfSupply !== "" && placeOfSupply === stateOf(inv.brandSnapshot.gstNumber);
    const billDate = inv.billDate.slice(0, 10);
    const dueDate = inv.dueDate.slice(0, 10);
    const termDays = Math.max(0, differenceInCalendarDays(parseISO(dueDate), parseISO(billDate)));

    return inv.items.map((item) => {
      const row: Partial<Record<Header, string>> = {
        "Invoice Number": inv.invoiceNumber,
        "Invoice Date": billDate,
        // Zoho derives Overdue itself, and payments (Skydo) close the invoice there.
        "Invoice Status": inv.status === "draft" ? "Draft" : "Sent",
        "Customer Name": inv.client.companyName.trim(),
        "GST Treatment": overseas ? "overseas" : clientGstin ? "business_gst" : "business_none",
        "GST Identification Number (GSTIN)": overseas ? "" : clientGstin ?? "",
        "Place of Supply": placeOfSupply,
        "Payment Terms": String(termDays),
        "Payment Terms Label": termDays === 0 ? "Due on Receipt" : `Net ${termDays}`,
        "Due Date": dueDate,
        "Currency Code": inv.currency,
        // Blank lets Zoho apply its own rate for foreign currency.
        "Exchange Rate": overseas ? "" : "1",
        Account: "Sales",
        "Item Name": item.description,
        "Item Type": "service",
        Quantity: "1",
        "Item Price": String(item.amount),
        "Is Inclusive Tax": "false",
        "Item Tax": `${intraState ? "GST" : "IGST"}${item.tax}`,
        "Item Tax Type": intraState ? "Tax Group" : "ItemAmount",
        "Item Tax %": String(item.tax),
        // Only set when an export actually charges IGST (no LUT).
        "Is Export Without LUT/Bond": overseas && item.tax > 0 ? "YES" : "",
        "Supply Type": "Taxable",
        Notes: inv.notes ?? "",
      };
      return HEADERS.map((h) => csvCell(row[h] ?? "")).join(",");
    });
  });
  return [HEADERS.join(","), ...rows].join("\n") + "\n";
}
