# Mandatory Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add red asterisk indicators on mandatory fields, always-enabled Create Invoice button with scroll-to-error validation, and a dirty-state-gated Save as Draft button.

**Architecture:** All changes are confined to `invoice-form.tsx`. Add an `errors` state object and an `isDirty` boolean; thread error/dirty updates through each field's onChange; replace the `isValid` disabled guard with per-button logic; implement scroll-to-first-error in `handleSubmit`.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, shadcn/ui, Tailwind CSS 4

---

## File Map

| File | Change |
|------|--------|
| `src/components/invoices/invoice-form.tsx` | Main changes: error state, isDirty, red asterisks, scroll-to-error, button guards |

No new files needed.

---

### Task 1: Add `errors` state and `isDirty` state

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx:36-72`

- [ ] **Step 1: Add the two new state variables after the existing `useState` declarations (around line 72)**

```tsx
const [errors, setErrors] = useState<{
  brandId?: boolean;
  clientCompany?: boolean;
  billDate?: boolean;
  dueDate?: boolean;
}>({});
const [isDirty, setIsDirty] = useState(false);
```

- [ ] **Step 2: Add a helper to mark the form as dirty — inline inside the component (after the new state, before `invoiceNumber`)**

```tsx
const markDirty = () => setIsDirty(true);
```

- [ ] **Step 3: Verify the file compiles with no TypeScript errors**

Run: `npm run build 2>&1 | tail -20`
Expected: no type errors related to `errors` or `isDirty`

---

### Task 2: Thread `markDirty` + error-clearing into every mandatory field's onChange

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx` (Brand Select, Bill Date Input, Due Date Input, Company Name Input)

Each mandatory field needs two things on change:
1. Call `markDirty()`
2. Clear its own error key when the user provides a value

- [ ] **Step 1: Brand Select — update `onValueChange` (currently line 182)**

```tsx
onValueChange={(v) => {
  setBrandId(v);
  markDirty();
  if (v) setErrors((prev) => ({ ...prev, brandId: false }));
}}
```

- [ ] **Step 2: Bill Date Input — update `onChange` (currently line 239)**

```tsx
onChange={(e) => {
  setBillDate(e.target.value);
  markDirty();
  if (e.target.value) setErrors((prev) => ({ ...prev, billDate: false }));
}}
```

- [ ] **Step 3: Due Date Input — update `onChange` (currently line 249)**

```tsx
onChange={(e) => {
  setDueDate(e.target.value);
  markDirty();
  if (e.target.value) setErrors((prev) => ({ ...prev, dueDate: false }));
}}
```

- [ ] **Step 4: Company Name Input — update `onChange` (currently line 302)**

```tsx
onChange={(e) => {
  setClientCompany(e.target.value);
  markDirty();
  if (e.target.value) setErrors((prev) => ({ ...prev, clientCompany: false }));
}}
```

- [ ] **Step 5: Also call `markDirty()` on the non-mandatory fields so any edit enables "Save as Draft". Update these onChange handlers to add `markDirty()` (no error clearing needed):**

Fields to update:
- Currency Select (`onValueChange`)
- Contact Name Input (`onChange`)
- Address Textarea (`onChange`)
- Email Input (`onChange`)
- GST Number Input (`onChange`)
- Notes Textarea (`onChange`)
- Line items (already handled via `setItems` — wrap: `onChange={(items) => { setItems(items); markDirty(); }}` on the `LineItemsTable`)

- [ ] **Step 6: `handleClientSelect` — add `markDirty()` so selecting a saved client enables "Save as Draft"**

In `handleClientSelect` (currently ~line 80), add `markDirty()` at the top of the function body:

```tsx
const handleClientSelect = (clientId: string) => {
  markDirty();
  setSelectedClientId(clientId);
  // ... rest unchanged
```

- [ ] **Step 7: Verify the file compiles cleanly**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

---

### Task 3: Update `handleSubmit` — replace silent early-return with scroll-to-error

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx:110-165`

- [ ] **Step 1: Replace the current validation block (line 111) with this**

```tsx
const handleSubmit = (status: "draft" | "sent") => {
  // Mandatory field validation (only for non-draft submissions)
  if (status !== "draft") {
    const newErrors = {
      brandId: !brandId,
      clientCompany: !clientCompany,
      billDate: !billDate,
      dueDate: !dueDate,
    };
    const hasErrors = Object.values(newErrors).some(Boolean);
    if (hasErrors) {
      setErrors(newErrors);
      const firstErrorId = newErrors.brandId
        ? "field-brand"
        : newErrors.clientCompany
        ? "field-company"
        : newErrors.billDate
        ? "field-billdate"
        : "field-duedate";
      document
        .getElementById(firstErrorId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
  // closing brace for the if (status !== "draft") block is above ↑
  // continue with the existing invoice creation logic below:
  const invoice: Invoice = {
    // ... keep everything from here to the end of handleSubmit exactly as-is
```

Note: Keep everything from line 113 onward (`const invoice: Invoice = {`) exactly as-is. Only replace line 111's guard.

- [ ] **Step 2: Remove the now-unused `isValid` computed value (line 165)**

Delete the line:
```tsx
const isValid = !!(brandId && clientCompany && billDate && dueDate);
```

- [ ] **Step 3: Verify the file compiles cleanly**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

---

### Task 4: Add `id` attributes to mandatory field wrappers for scroll targeting

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx` (4 field wrapper `<div>`s)

Each mandatory field's outermost `<div className="space-y-2">` needs an `id` matching what `handleSubmit` uses.

- [ ] **Step 1: Brand field wrapper (currently line 175) — add `id="field-brand"`**

```tsx
<div className="space-y-2" id="field-brand">
```

- [ ] **Step 2: Bill Date field wrapper (currently ~line 234) — add `id="field-billdate"`**

```tsx
<div className="space-y-2" id="field-billdate">
```

- [ ] **Step 3: Due Date field wrapper (currently ~line 244) — add `id="field-duedate"`**

```tsx
<div className="space-y-2" id="field-duedate">
```

- [ ] **Step 4: Company Name field wrapper (currently ~line 298) — add `id="field-company"`**

```tsx
<div className="space-y-2" id="field-company">
```

---

### Task 5: Apply red border styling to errored fields

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx` (inputs + select triggers for mandatory fields)

Use `cn()` (already available via `@/lib/utils`) to conditionally apply `border-destructive` when the field has an error.

- [ ] **Step 1: Confirm `cn` is imported — if not, add it**

Check line 22: `import { formatCurrency } from "@/lib/utils";`
Update to: `import { formatCurrency, cn } from "@/lib/utils";`

- [ ] **Step 2: Brand SelectTrigger — add error class**

```tsx
<SelectTrigger className={cn("text-sm", errors.brandId && "border-destructive")}>
```

- [ ] **Step 3: Bill Date Input — add error class**

```tsx
<Input
  type="date"
  value={billDate}
  onChange={...}
  className={cn("text-sm", errors.billDate && "border-destructive")}
  required
/>
```

- [ ] **Step 4: Due Date Input — add error class**

```tsx
<Input
  type="date"
  value={dueDate}
  onChange={...}
  className={cn("text-sm", errors.dueDate && "border-destructive")}
  required
/>
```

- [ ] **Step 5: Company Name Input — add error class**

```tsx
<Input
  value={clientCompany}
  onChange={...}
  placeholder="Acme Corp"
  className={cn("text-sm", errors.clientCompany && "border-destructive")}
  required
/>
```

- [ ] **Step 6: Verify the file compiles cleanly**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

---

### Task 6: Replace plain `*` text in labels with red asterisk spans

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx` (4 Label elements)

- [ ] **Step 1: Brand label (currently line 176)**

```tsx
<Label className="text-xs">Brand <span className="text-destructive">*</span></Label>
```

- [ ] **Step 2: Bill Date label (currently ~line 235)**

```tsx
<Label className="text-xs">Bill Date <span className="text-destructive">*</span></Label>
```

- [ ] **Step 3: Due Date label (currently ~line 245)**

```tsx
<Label className="text-xs">Due Date <span className="text-destructive">*</span></Label>
```

- [ ] **Step 4: Company Name label (currently ~line 299)**

```tsx
<Label className="text-xs">Company Name <span className="text-destructive">*</span></Label>
```

- [ ] **Step 5: Currency label (currently ~line 212)**

```tsx
<Label className="text-xs">Currency <span className="text-destructive">*</span></Label>
```

---

### Task 7: Update button `disabled` logic

**Files:**
- Modify: `src/components/invoices/invoice-form.tsx:412-464` (Actions section)

- [ ] **Step 1: Create Invoice button — remove `disabled` entirely**

```tsx
<Button
  size="sm"
  className="text-xs"
  onClick={() => handleSubmit("sent")}
>
  Create Invoice
</Button>
```

- [ ] **Step 2: Save as Draft button — enable only when `isDirty`**

```tsx
<Button
  variant="outline"
  size="sm"
  className="text-xs"
  onClick={() => handleSubmit("draft")}
  disabled={!isDirty}
>
  Save as Draft
</Button>
```

- [ ] **Step 3: Edit mode — Save Changes button — remove `disabled` entirely**

```tsx
<Button
  size="sm"
  className="text-xs"
  onClick={() => handleSubmit("draft")}
>
  Save Changes
</Button>
```

- [ ] **Step 4: Edit mode — Mark as Sent button — remove `disabled` entirely (validation runs inside `handleSubmit`)**

```tsx
<Button
  variant="outline"
  size="sm"
  className="text-xs"
  onClick={() => handleSubmit("sent")}
>
  Mark as Sent
</Button>
```

- [ ] **Step 5: Final build check**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/invoices/invoice-form.tsx
git commit -m "feat: mandatory field red asterisks, scroll-to-error validation, smart button states"
```

---

## Manual Test Checklist

After implementation, verify in the browser (`npm run dev`):

1. **Red asterisks** visible on Brand, Bill Date, Due Date, Company Name, Currency labels
2. **Create Invoice button** is always clickable (not greyed out on page load)
3. **Save as Draft** is disabled on page load; enabled after typing in any field
4. **Click Create Invoice with empty form** → red borders on Brand + Company Name + Due Date (Bill Date has a default); page scrolls to Brand field
5. **Fill Brand only** → click Create → scrolls to Company Name
6. **Fill all mandatory fields** → click Create → invoice saved, navigates to invoice detail
7. **Fill Brand + Company** → Save as Draft → saves without validation errors
8. **Edit a draft with missing fields** → Mark as Sent → shows errors and scrolls
