# Invoicer

**A local-first invoicing tool. No accounts. No servers. No subscriptions.**

Invoicer runs entirely in your browser. Create professional invoices, generate PDFs, manage clients and brands — all stored in `localStorage`. Your data never leaves your machine.

---

## Features

### Invoices

- **Line items** with per-item tax rates, descriptions, and amounts
- **Multi-currency** — INR (₹), USD ($), SGD (S$) — set per invoice
- **Status lifecycle** — `Draft → Sent → Paid / Overdue`
- **Draft editing** — drafts stay fully editable; finalized invoices are locked
- **Mandatory field validation** — required fields are marked and validated before an invoice is finalized; drafts can be saved with partial data
- **PDF export** — print-ready PDF with your brand logo, invoice number, line items, tax breakdown, bank details, and notes

### Brands

Each brand represents a business you invoice from. You can maintain multiple brands independently.

- Name, address, email, and phone
- GST and PAN numbers
- Logo — stored locally as base64, embedded in generated PDFs
- Bank details — account number, IFSC, branch, UPI ID — printed on every PDF
- Invoice number prefix — e.g. prefix `SC` produces `SC2026001`, `SC2026002`, ...

### Clients

Save the businesses and individuals you bill regularly.

- Company name, contact name, address, email, phone, and GST number
- Auto-fill any saved client when creating a new invoice
- Optionally save a new client directly from the invoice form

### Dashboard

- Overview of all invoices with status badges
- Total amounts broken out by currency when multiple currencies are in use
- Quick-access links to create invoices, brands, and clients

### Import & Export

- **Export** — downloads a timestamped JSON file containing all invoices, brands, and clients
- **Import** — restores data from a previously exported file
- **Conflict resolution** — if an imported invoice number already exists, you choose per-conflict: overwrite, rename (with a new number), or discard

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Development

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

```bash
# Build and run (foreground)
docker compose up --build

# Run in the background
docker compose up --build -d

# Stop
docker compose down
```

Open [http://localhost:3001](http://localhost:3001).

> The Docker image uses Next.js standalone output — lightweight and self-contained with no external dependencies or environment variables required.

---

## How It Works

### 1 — Set up a Brand

Everything starts with a brand. Go to **Brands → New Brand** and enter your business details: name, address, contact info, GST/PAN, bank details, logo, and the invoice number prefix. You can have as many brands as you need.

### 2 — Add Clients *(optional)*

Go to **Clients → New Client** to save clients you invoice regularly. When creating an invoice, selecting a saved client auto-fills their details. You can also save a new client on the fly from the invoice form.

### 3 — Create an Invoice

Click **New Invoice** from the dashboard. Select a brand, fill in the client details, set the currency, bill date, and due date, then add your line items with descriptions and per-item tax rates. Invoices start as **Draft**.

- Required fields (Brand, Bill Date, Due Date, Company Name) are marked with a red `*`
- Clicking **Create Invoice** validates required fields and scrolls to any that are missing
- **Save as Draft** is available once you've made any change — no required fields enforced

### 4 — Manage Status

Open an invoice to update its status:

| Status | Description |
|--------|-------------|
| `Draft` | Work in progress — fully editable |
| `Sent` | Delivered to the client — locked from editing |
| `Paid` | Payment received |
| `Overdue` | Past the due date, payment outstanding |

Promoting a draft to any non-draft status requires all mandatory fields to be filled.

### 5 — Download PDF

On any invoice page, click **Download PDF**. The generated PDF includes your brand logo, invoice number, dates, full line item table, subtotal, tax, total, bank details, and any notes.

### 6 — Back Up Your Data

Your data lives only in your browser's `localStorage`. To back it up or move it to another device, use the **Export** button on the dashboard to download a JSON snapshot. Use **Import** to restore from a snapshot.

---

## Data Storage

All data is stored client-side. Nothing is transmitted to any server.

| `localStorage` key | Contents |
|--------------------|----------|
| `invoicer_brands` | Brands |
| `invoicer_clients` | Saved clients |
| `invoicer_invoices` | All invoices |

> Clearing your browser's site data will erase everything. Export regularly.

---

## Tech Stack

| | |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) — App Router, TypeScript |
| UI Components | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| PDF Generation | [@react-pdf/renderer](https://react-pdf.org) |
| Date Utilities | [date-fns](https://date-fns.org) |
| Storage | Browser `localStorage` — no backend required |

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for anything beyond small fixes, so we can discuss the change first.

```bash
# Run the dev server
npm run dev

# Lint
npm run lint

# Production build (run this before submitting a PR)
npm run build
```

---

## License

[MIT](./LICENSE)
