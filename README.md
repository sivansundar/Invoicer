# Invoicer

A clean, minimal invoicing tool built with Next.js. Create and manage invoices, brands, and clients — all stored locally in your browser with no backend or account required.

---

## Features

### Invoices
- **Create invoices** with line items, tax rates, due dates, and notes
- **Edit draft invoices** — full editing support for any invoice still in draft status
- **PDF export** — download any invoice as a print-ready PDF
- **Status tracking** — move invoices through `Draft → Sent → Paid / Overdue`
- **Multi-currency** — supports INR, USD, and SGD per invoice
- **Delete** invoices with a confirmation prompt

### Brands
- Create multiple brands (businesses/entities you invoice from)
- Each brand has its own name, address, email, phone, GST number, logo, and bank details
- Configurable invoice number prefix and auto-incrementing sequence (e.g. `INV-001`, `INV-002`)

### Clients
- Save frequently billed clients for quick selection when creating invoices
- Client data (name, company, address, email, GST) is stored and reusable across invoices

### Import & Export
- **Export** all your invoices to a JSON file (includes all fields and statuses) — great for backups
- **Import** a previously exported JSON file to restore or migrate invoices
- **Conflict resolution** — if an imported invoice number already exists, you're given three options per conflict:
  - **Overwrite** — replace the existing entry
  - **Change Number** — import with a new invoice number you specify
  - **Discard** — skip that invoice entirely
- After import, a summary shows how many were imported, overwritten, renamed, or skipped

### Dashboard
- Overview of total invoices, paid revenue, and pending amounts
- Revenue and pending totals are broken down per currency when multiple currencies are in use
- Full invoice history table sorted by most recent first

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| UI | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| PDF | [@react-pdf/renderer](https://react-pdf.org) |
| Icons | [Lucide React](https://lucide.dev) |
| Date handling | [date-fns](https://date-fns.org) |
| Storage | Browser `localStorage` (no backend required) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm (or your preferred package manager)

### Installation

```bash
# Clone the repository
git clone https://github.com/sivansundar/invoicer.git
cd invoicer

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

---

## Usage

### First-time setup

1. **Create a Brand** — go to **Brands → New Brand** and fill in your business details, bank info, and set an invoice prefix (e.g. `INV`).
2. *(Optional)* **Add Clients** — go to **Clients → New Client** to pre-save your frequent clients.
3. **Create an Invoice** — click **New Invoice** on the dashboard, select your brand and client, add line items, and either save as draft or create and send.

### Data Storage

All data is stored in your browser's `localStorage`. Nothing is sent to any server. To move your data between browsers or devices, use the **Export** and **Import** buttons on the dashboard.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Dashboard
│   ├── invoices/
│   │   ├── create/               # New invoice page
│   │   └── [id]/
│   │       ├── page.tsx          # Invoice detail & status management
│   │       ├── edit/page.tsx     # Edit draft invoice
│   │       └── pdf-download-button.tsx
│   ├── brands/                   # Brand CRUD
│   └── clients/                  # Client CRUD
├── components/
│   ├── invoices/
│   │   ├── invoice-form.tsx      # Shared create/edit form
│   │   ├── invoice-view.tsx      # Read-only invoice preview
│   │   ├── invoice-pdf.tsx       # PDF template
│   │   ├── invoice-table.tsx     # Dashboard table
│   │   ├── import-export.tsx     # Import/export with conflict resolution
│   │   ├── line-items-table.tsx
│   │   └── status-badge.tsx
│   ├── brands/
│   ├── clients/
│   ├── layout/
│   └── ui/                       # shadcn/ui primitives
├── hooks/                        # useInvoices, useBrands, useClients
└── lib/
    ├── storage.ts                # localStorage read/write helpers
    ├── types.ts                  # TypeScript interfaces
    └── utils.ts                  # Currency formatting, cn()
```

---

## License

MIT
