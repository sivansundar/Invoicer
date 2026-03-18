# Invoicer

A simple, local-first invoicing tool. No accounts, no database, no backend — just your browser.

Create professional invoices, export them as PDFs, and manage your clients and brands entirely client-side. Everything lives in `localStorage`. Export your data to JSON at any time to back it up or move it to another device.

---

## Features

**Invoices**
- Create invoices with line items, tax rates, bill/due dates, currency, and notes
- Edit invoices in Draft status at any time
- Track status: `Draft → Sent → Paid` or `Overdue`
- Export any invoice as a print-ready PDF

**Brands**
- Set up multiple brands (the businesses you invoice from)
- Each brand has its own name, address, logo, GST/PAN, bank details, and invoice number prefix
- Invoice numbers auto-increment per year (e.g. `INV-2026001`)

**Clients**
- Save frequently billed clients to reuse across invoices
- Stores name, company, address, email, phone, and GST number

**Multi-currency**
- Per-invoice currency: INR (₹), USD ($), SGD (S$)
- Dashboard totals broken out by currency when multiple are in use

**Import & Export**
- Export all your data (invoices, brands, clients) to a timestamped JSON file
- Import a backup file to restore or migrate data
- Conflict resolution when an imported invoice number already exists — choose to overwrite, rename, or discard per conflict

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Run Locally

```bash
git clone https://github.com/sivansundar/invoicer.git
cd invoicer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

### Docker

Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running, then:

```bash
# Build and start
docker compose up --build

# Run in the background
docker compose up --build -d

# Stop
docker compose down
```

Open [http://localhost:3001](http://localhost:3001).

> The image uses Next.js standalone output — small, self-contained, no environment variables or external services needed.

---

## Usage

### 1. Create a Brand

Before creating invoices, add at least one brand.

Go to **Brands → New Brand** and fill in your business details:
- Name, address, email, phone
- GST / PAN numbers *(optional)*
- Logo — stored locally as base64
- Bank details — shown on the PDF (account number, IFSC, UPI, etc.)
- Invoice number prefix — e.g. `INV` → invoices will be numbered `INV-2026001`, `INV-2026002`, etc.

### 2. Save Your Clients *(optional)*

Go to **Clients → New Client** to pre-save the businesses or individuals you regularly bill. When creating an invoice, select a saved client to auto-fill their details.

### 3. Create an Invoice

Click **New Invoice** on the dashboard:

1. Select a brand and optionally a saved client
2. Fill in the client details (if not pre-saved), bill date, due date, currency, and tax rate
3. Add line items — description, quantity, unit rate
4. Add any notes (e.g. payment terms)
5. Save — invoices start in **Draft** status

### 4. Manage Status

Open any invoice to update its status:

| Status | Meaning |
|--------|---------|
| `Draft` | Created, not yet sent — can still be edited |
| `Sent` | Sent to the client |
| `Paid` | Payment received |
| `Overdue` | Past due date, payment not received |

> Only **Draft** invoices can be edited after creation.

### 5. Download as PDF

On any invoice page, click **Download PDF**. The PDF includes your brand logo, invoice number, dates, line items, subtotal, tax, total, bank details, and notes.

### 6. Backup & Restore

Your data is stored only in your browser. To back it up or move it to another device:

- **Export** — click Export on the dashboard to download a JSON file with all your data
- **Import** — click Import and select a previously exported file to restore it

If any imported invoice numbers conflict with existing ones, you'll be asked — for each conflict — whether to **Overwrite**, **Rename**, or **Discard** the imported entry.

---

## Data Storage

All data lives in your browser's `localStorage`. Nothing is sent to a server.

| Key | Contents |
|-----|----------|
| `invoicer_brands` | Your brands |
| `invoicer_clients` | Your saved clients |
| `invoicer_invoices` | All invoices |

> Clearing browser site data will delete everything. Use **Export** regularly to keep backups.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | [Next.js](https://nextjs.org) (App Router, TypeScript) |
| UI | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Forms | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) |
| PDF | [@react-pdf/renderer](https://react-pdf.org) |
| Date handling | [date-fns](https://date-fns.org) |
| Storage | Browser `localStorage` — no backend required |

---

## License

MIT
