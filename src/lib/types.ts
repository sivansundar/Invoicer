export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  branch?: string;
  upiId?: string;
}

export interface Brand {
  id: string;
  name: string;
  address: string;
  email: string;
  phone?: string;
  gstNumber?: string;
  logo?: string; // base64 data URL
  bankDetails: BankDetails;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  createdAt: string;
}

export interface Client {
  id: string;
  name?: string;
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  createdAt: string;
}

export interface InvoiceClient {
  name?: string;
  companyName: string;
  address: string;
  email?: string;
  gstNumber?: string;
}

export interface LineItem {
  id: string;
  description: string;
  amount: number;
  tax: number; // percentage
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type Currency = "INR" | "USD" | "SGD";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  brandId: string;
  currency: Currency;
  status: InvoiceStatus;
  billDate: string;
  dueDate: string;
  client: InvoiceClient;
  items: LineItem[];
  subtotal: number;
  totalTax: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
