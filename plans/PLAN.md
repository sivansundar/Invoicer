# Invoicer - Freelance Invoice Management App

## Overview
A minimal, terminal-aesthetic invoicing web app for freelancers. Built with Next.js 14 (App Router), ShadCN UI, and localStorage for persistence. Monospace font throughout.

---

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **UI**: ShadCN/UI + Tailwind CSS
- **Font**: JetBrains Mono (monospace, terminal feel)
- **Storage**: localStorage (designed to be swappable to Convex later)
- **PDF**: `@react-pdf/renderer` for invoice PDF generation
- **State**: React context + localStorage sync
- **Icons**: Lucide React (comes with ShadCN)

---

## Data Models

### Brand / Profile
```ts
{
  id: string                // uuid
  name: string              // "Sivan Studio"
  address: string           // Full address
  email: string
  phone: string
  gstNumber?: string        // Optional GST
  logo?: string             // Base64 data URL
  bankDetails: {
    accountName: string
    accountNumber: string
    bankName: string
    ifscCode: string
    branch?: string
    upiId?: string
  }
  invoicePrefix: string     // e.g. "SS" -> invoices: SS-001, SS-002
  nextInvoiceNumber: number // Auto-incrementing counter
  createdAt: string
}
```

### Invoice
```ts
{
  id: string
  invoiceNumber: string     // Auto-generated: "SS-001"
  brandId: string           // Reference to brand
  status: "draft" | "sent" | "paid" | "overdue"

  // Dates
  billDate: string          // Date of generation
  dueDate: string           // Payment due date

  // Client (Billed To)
  client: {
    name: string            // Contact person
    companyName: string
    address: string
    email?: string
    gstNumber?: string      // Optional
  }

  // Line Items
  items: Array<{
    id: string
    description: string     // "Development Services", "Photography"
    amount: number
    tax: number             // Tax percentage (e.g. 18 for 18%)
  }>

  // Computed (stored for PDF snapshots)
  subtotal: number
  totalTax: number
  total: number

  notes?: string            // Optional notes/terms
  createdAt: string
  updatedAt: string
}
```

---

## Pages & Routes

### 1. `/` - Dashboard
- Summary stats: Total invoices, total revenue, pending amount
- Recent invoices table (sortable by date, filterable by status)
- Quick actions: Create Invoice, Manage Brands
- Status badges: draft (gray), sent (blue), paid (green), overdue (red)

### 2. `/invoices/create` - Create Invoice
Multi-section form (single page, not wizard):
1. **Select Brand** - Dropdown of configured brands
2. **Dates** - Bill date (defaults to today), due date
3. **Billed To** - Client name, company, address, GST (optional)
4. **Line Items** - Dynamic table: description, amount, tax%. Add/remove rows
5. **Summary** - Auto-calculated subtotal, tax, total
6. **Notes** - Optional terms/notes textarea
7. **Actions** - Save as Draft / Save & Download PDF

### 3. `/invoices/[id]` - View Invoice
- Full invoice view (matches PDF layout)
- Actions: Download PDF, Mark as Sent/Paid, Edit, Delete

### 4. `/brands` - Brand Management
- List of all configured brands
- Card layout showing brand name, logo, prefix

### 5. `/brands/create` and `/brands/[id]/edit` - Brand Form
- Brand name, address, contact info
- Logo upload (stored as base64 in localStorage)
- Bank details section
- Invoice prefix + current counter display

---

## Key Components

```
src/
  app/
    layout.tsx              # Root layout, font setup, providers
    page.tsx                # Dashboard
    invoices/
      create/page.tsx       # Create invoice form
      [id]/page.tsx         # View invoice
    brands/
      page.tsx              # Brand list
      create/page.tsx       # Create brand
      [id]/edit/page.tsx    # Edit brand
  components/
    ui/                     # ShadCN components
    layout/
      header.tsx            # Top nav bar
      sidebar.tsx           # Optional: minimal sidebar nav
    invoices/
      invoice-form.tsx      # The create/edit invoice form
      invoice-table.tsx     # Dashboard invoice list
      invoice-view.tsx      # Invoice detail/preview
      invoice-pdf.tsx       # PDF template using @react-pdf/renderer
      line-items-table.tsx  # Dynamic line items editor
      status-badge.tsx      # Status indicator
    brands/
      brand-form.tsx        # Brand create/edit form
      brand-card.tsx        # Brand display card
  lib/
    storage.ts              # localStorage abstraction (easy to swap to Convex)
    types.ts                # TypeScript interfaces
    utils.ts                # Helpers (ID generation, number formatting, etc.)
    pdf.ts                  # PDF generation logic
  hooks/
    use-brands.ts           # Brand CRUD hook
    use-invoices.ts         # Invoice CRUD hook
```

---

## Storage Abstraction

All data access goes through `lib/storage.ts` which exposes:
```ts
// Generic interface - swap implementation to Convex later
getBrands(): Brand[]
getBrand(id): Brand | null
saveBrand(brand): void
deleteBrand(id): void

getInvoices(): Invoice[]
getInvoice(id): Invoice | null
saveInvoice(invoice): void
deleteInvoice(id): void

getNextInvoiceNumber(brandId): string  // Auto-increment
```

localStorage keys: `invoicer_brands`, `invoicer_invoices`

---

## Design Principles

1. **Terminal aesthetic**: Monospace font (JetBrains Mono), minimal color palette
2. **Color scheme**: Dark mode default. Near-black background, white/gray text, accent color for CTAs
3. **Spacing**: Generous whitespace, clean grid alignment
4. **Components**: ShadCN defaults with minimal customization
5. **Responsive**: Desktop-first but usable on tablet

---

## Implementation Order

### Phase 1: Project Setup
- [x] Initialize Next.js 14 with TypeScript
- [x] Install & configure ShadCN UI
- [x] Set up Tailwind with custom theme (dark, monospace)
- [x] Add JetBrains Mono font
- [x] Create base layout with navigation

### Phase 2: Data Layer
- [ ] Define TypeScript types
- [ ] Build localStorage abstraction
- [ ] Create React hooks for brands & invoices

### Phase 3: Brand Management
- [ ] Brand list page
- [ ] Brand create/edit form (with logo upload + bank details)
- [ ] Brand delete with confirmation

### Phase 4: Invoice Creation
- [ ] Invoice form with brand selection
- [ ] Dynamic line items table
- [ ] Auto-calculation of totals
- [ ] Auto-generated invoice numbers (per-brand prefix + sequence)
- [ ] Save to localStorage

### Phase 5: Dashboard
- [ ] Invoice history table with sorting/filtering
- [ ] Summary stats cards
- [ ] Status management (draft/sent/paid/overdue)

### Phase 6: Invoice View & PDF
- [ ] Invoice detail view page
- [ ] PDF generation with @react-pdf/renderer
- [ ] Download PDF action
- [ ] Invoice preview matching PDF layout

---

## Notes
- localStorage limit is ~5MB, sufficient for hundreds of invoices
- Logo images should be compressed before base64 encoding
- Invoice numbers are per-brand: each brand has its own counter
- All amounts in INR (Indian Rupees) given GST context
- Future: Swap localStorage for Convex with minimal changes via storage abstraction
