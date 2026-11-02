# Zoho Books Export — Design

**Date:** 2026-11-02
**Branch:** `claude/great-feynman-fiemsa`
**Status:** Plan for review. Nothing below is implemented yet.

## Goal

Export any Invoicer invoice — INR to an Indian client, or USD/SGD to an overseas
client (Singapore clients carry a UEN) — as a file that Zoho Books (India edition,
GST-registered organisation) imports **without a single rejected row**, together with
a checklist of what the Zoho organisation must have set up before the first import.

## Where we are

A first cut already shipped on `main` yesterday (PR #21): `src/lib/zoho-export.ts`
writes one CSV per invoice in Zoho's 72-column invoice import layout, and the invoice
detail page has an **Export for Zoho** button. Clients got an optional `uen`.

That cut was written from memory of the Zoho template. The research pass for this plan
found four things in it that Zoho will reject or silently mis-book, and several
gaps that make an error-free import a matter of luck rather than design. This plan
hardens that export rather than replacing it.

## Research summary and confidence

Zoho's documentation hosts are blocked from the development sandbox, so the research
was done from search-engine snippets of Zoho's own KB/help pages, Zoho community
answers (some by Zoho staff) and the Zoho Books REST API v3 reference. Each finding
below is tagged **[Official]** (Zoho KB/help/API text), **[Forum]** (community, incl.
Zoho staff) or **[Unverified]**. Anything Unverified is resolved in Phase 0 by a live
test import into the real organisation — not by guessing.

### Facts that change the current export

| # | Finding | Confidence | Current code | Change |
|---|---|---|---|---|
| 1 | Zoho's Place of Supply codes differ from the common GST abbreviations for three states: Odisha **OD** (not OR), Chhattisgarh **CG** (not CT), Andhra Pradesh **AD** (not AP). Telangana is TS, Uttarakhand UK. | Official | OR / CT / AP | Fix the map. |
| 2 | Overseas customers must have Place of Supply **Other Territory = `OT`**; a foreign country or blank cannot be pushed to GST returns. | Official | blank | Emit `OT`. |
| 3 | The **import** accepts GST Treatment tokens `business_registered_regular`, `business_registered_composition`, `business_sez`, `business_unregistered`, `consumer`, `overseas`. `business_gst` / `business_none` are the **API** tokens; whether the importer also accepts them is unknown. | Official (import list) / Unverified (API tokens in CSV) | `business_gst`, `business_none` | Emit the import tokens. |
| 4 | Foreign-currency imports do **not** fetch an exchange rate; a blank rate is booked at 1, so a USD 1,500 invoice becomes ₹1,500 in the books. | Forum (Zoho staff) | blank for non-INR | Require an explicit rate per non-INR invoice. |
| 5 | Documented import statuses are **Draft** and **Open**. Imported as Open, an invoice is locked and cannot be edited or re-imported. "Sent" is undocumented. Paid cannot be imported here at all; payments are a separate import. | Official (Draft/Open) / Unverified ("Sent") | `Sent` | Default to `Draft`; user can opt into `Open` once the layout is proven. |
| 6 | Customer matching is by **name**. If no contact matches, Zoho **creates** one — with no GSTIN, treatment or currency — and several users report a duplicate contact created on every import. | Official (create-on-miss) / Forum (duplicates) | companyName, trimmed | Add an optional per-client Zoho display name; ship a Customers CSV so contacts exist first. |
| 7 | Tax names must already exist in the organisation (default India names follow `GST18` / `IGST18`; GST12 and GST18 confirmed). Intra-state uses Item Tax Type `Tax Group`, inter-state `ItemAmount`. Intra-state tax with an inter-state Place of Supply (or vice versa) is rejected. | Official | correct | Keep; add a pre-flight check that the rate is one Zoho has (0/5/12/18/28) and state logic agrees. |
| 8 | Every line needs either a tax **or** an Item Tax Exemption Reason. Exports under LUT use `IGST0`. `Is Export Without LUT/Bond = YES` means "export **with** payment of IGST" (tax payable, not added to total, refund claimed). | Official (zero-rate/exemption) / Forum (LUT column) | IGST0; YES when tax>0 | Keep; make the LUT/with-payment choice an explicit brand setting rather than inferred from a non-zero tax. |
| 9 | Zoho India has **no foreign tax-number field** on a contact; a UEN must go in a custom contact field. Zoho Singapore has one, but the organisation here is Indian. | Forum (Zoho support) | UEN only printed on PDF | Put UEN in the Customers CSV as a custom-field column and in the invoice Notes. |
| 10 | Columns are matched by **header name** in the Map Fields step; order is irrelevant; unmapped columns are ignored. Dates are mapped per column with a user-chosen format; CSV/TSV/XLS up to 10 MB; UTF-8 default. | Official | ISO dates | Keep ISO `yyyy-MM-dd`, document "choose yyyy-MM-dd in Map Fields". |

### Things only a live import can settle (Phase 0)

- Exact current header list (the 72 headers in code vs the sample file in the org; in
  particular `Item Tax` vs `Item Tax Name`).
- Whether `Sent` is accepted as a status, and whether `business_gst` happens to work.
- Behaviour on an Invoice Number that already exists (skip / overwrite / duplicate).
- Whether unknown Item Names are stored as ad-hoc lines or auto-created as items.
- Accepted tokens for `Supply Type`, `Item Type`, `Is Inclusive Tax`, `Is Export Without LUT/Bond`.
- The date-format options offered in Map Fields.

## Prerequisites in Zoho Books (user action, before any import)

These are checked in the Zoho organisation itself; Invoicer cannot set them. The plan
puts the same list in-app behind the export button so it is never lost.

1. **Plan tier.** Multi-currency is not on the Free plan. USD/SGD invoices need a paid
   plan with multi-currency (Standard or Professional upward; Zoho's pricing pages
   disagree on which). *Confirm your plan.*
2. **GST settings.** Settings → Taxes → GST Settings: GST enabled, organisation GSTIN
   (must match the brand's GSTIN in Invoicer), registration date. Enabling GST creates
   the default tax rates and groups.
3. **Tax names.** Settings → Taxes → Tax Rates must contain the names the export uses:
   `GST0 GST5 GST12 GST18 GST28` (groups) and `IGST0 IGST5 IGST12 IGST18 IGST28`.
   Rename or map if yours differ. Note GST 2.0 (Sept 2025) added new rates alongside
   the old ones.
4. **LUT.** If you export services without charging IGST, your LUT number and validity
   must be entered under GST settings; otherwise exports are "with payment" and the
   export must set the with-payment flag. *Tell us which applies.*
5. **Currencies.** Settings → Currencies: add USD and SGD. Decide whether Zoho's
   exchange-rate feed or your own rate is the book rate; the import will carry the
   rate you enter in Invoicer either way.
6. **Chart of Accounts.** An income account named exactly `Sales` (Zoho default). The
   export will use that name unless the brand overrides it.
7. **Customers first.** Create or import every client as a contact before importing
   invoices, with Display Name byte-identical to what the invoice file sends, GST
   treatment, GSTIN, Place of Contact (state), currency. Phase 2 generates this file.
8. **UEN custom field.** Settings → Preferences → Customers and Vendors → Custom
   Fields: a text field (suggested label `UEN`) so Singapore clients' registration
   numbers are stored, not just printed.
9. **Invoice numbering.** Imported invoices keep their own numbers; the import does not
   advance Zoho's auto-number. Make sure the Zoho series and the Invoicer series
   (`SC-2026-001` style) cannot collide, or let Zoho renumber via the wizard's
   "Auto-generate Invoice Numbers" box.
10. **e-Invoicing.** If IRN generation is enabled, import as Draft, review, then push to
    the IRP from Zoho. An invoice with an IRN is locked.
11. **Items (optional).** Pre-creating service items with SAC codes and default tax
    preference avoids ad-hoc lines in reports.

## Decisions

- **CSV, not the API.** Invoicer is local-first with no backend; Zoho OAuth needs a
  server-side token exchange and a registered client per data centre. CSV import keeps
  that promise and matches the user's stated workflow ("upload it there"). The API
  stays a documented future option (see Appendix).
- **One file format, two scopes.** The same CSV generator serves the per-invoice button
  (today) and a new bulk export on the Reports page (brand, FY/month range, status
  filter — reusing the summary-report filters).
- **Pre-flight validation blocks the download.** An export that Zoho would reject is
  refused in Invoicer with the row, column and reason, the same way the invoice form
  refuses an incomplete invoice. Warnings (not errors) still download.
- **Draft by default.** Status column is `Draft` unless the user ticks "Import as Open".
- **Explicit over inferred, with safe inference as the default.** GST treatment, place
  of supply, exchange rate, export type and SAC all get real fields with sensible
  defaults; the export never silently guesses where a wrong guess costs money.
- **Zoho's import vocabulary lives in one table.** State codes, treatment tokens, tax
  name pattern, status tokens and the header list are constants in one module with the
  source noted, so a Phase-0 correction is a one-line edit.

## Data model additions (all optional, no migration needed)

| Record | Field | Type | Purpose / default |
|---|---|---|---|
| `Client`, `InvoiceClient` | `country` | ISO-3166 alpha-2 string | Drives overseas vs domestic instead of inferring from currency. Default: `"IN"` when a GSTIN is present or currency is INR, otherwise unknown → validation asks. |
| `Client`, `InvoiceClient` | `gstTreatment` | `"registered_regular" \| "registered_composition" \| "sez" \| "unregistered" \| "consumer" \| "overseas"` | Override of the inferred treatment. Inferred: overseas if `country !== "IN"`, registered_regular if GSTIN present, else unregistered. |
| `Client`, `InvoiceClient` | `placeOfSupply` | Zoho state code | Override for an Indian client without a GSTIN (today assumed to be in the brand's state, silently). |
| `Client` | `zohoDisplayName` | string | Exact Zoho contact Display Name when it differs from `companyName`. |
| `Invoice` | `exchangeRate` | number | 1 unit of invoice currency in INR. Required by validation for non-INR exports; editable on the detail page like `paidOn`. |
| `Brand`, `BrandSnapshot` | `zoho.exportType` | `"without_payment_lut" \| "with_payment"` | Default `without_payment_lut`. Drives the LUT column and whether non-zero tax on an export is an error. |
| `Brand`, `BrandSnapshot` | `zoho.salesAccount` | string | Default `Sales`. |
| `Brand`, `BrandSnapshot` | `zoho.defaultSac` | string | SAC for service lines, e.g. `998314`. |
| `LineItem` | `sac` | string | Per-line override of the brand default. |

Treatment tokens are stored in Invoicer's own vocabulary and mapped to Zoho's import
tokens in the export module, so a Zoho rename never touches stored data. All fields are
optional and undefined reads as "infer", so existing invoices export unchanged apart
from the corrections in the table above.

## Export pipeline

```
Invoice[] ──▶ resolve(invoice, brandSnapshot)  // treatment, PoS, tax name, rate, SAC
          ──▶ validate(resolved)               // errors block, warnings annotate
          ──▶ toZohoInvoiceRows(resolved)       // one row per line item
          ──▶ csv(HEADERS, rows)                // RFC 4180, UTF-8 BOM, CRLF
```

Validation rules (errors unless marked warning):

- Customer name empty; invoice number empty; bill date / due date unparseable.
- Non-INR invoice without `exchangeRate`.
- Domestic client, treatment registered, GSTIN missing or not 15 chars with a known
  state prefix.
- Place of Supply unresolvable (domestic client, no GSTIN, no override, brand has no
  GSTIN).
- Line tax rate not in `{0, 5, 12, 18, 28}` (warning: Zoho may have a custom tax of
  that name).
- Export invoice (treatment overseas) with non-zero tax while brand export type is
  `without_payment_lut`.
- Mixed tax types on one invoice that would need both intra- and inter-state taxes.
- Invoice is `paid` (warning: status exports as Draft/Open; record the payment in Zoho
  separately, or use the Phase 3 payments file).
- Line description empty or longer than Zoho's item-name limit (warning, truncate to
  Item Desc).

Column values per resolved invoice:

| Column | Domestic, GSTIN | Domestic, no GSTIN | Overseas |
|---|---|---|---|
| GST Treatment | `business_registered_regular` (or override) | `business_unregistered` / `consumer` | `overseas` |
| GSTIN | client GSTIN | blank | blank |
| Place of Supply | from GSTIN prefix | override or brand state | `OT` |
| Item Tax / Type / % | `GST18` `Tax Group` 18 if PoS = brand state, else `IGST18` `ItemAmount` 18 | same rule | `IGST0` `ItemAmount` 0 |
| Is Export Without LUT/Bond | blank | blank | `YES` only when brand export type is with-payment |
| Currency Code / Exchange Rate | INR / 1 | INR / 1 | USD or SGD / `invoice.exchangeRate` |
| Invoice Status | `Draft` (or `Open`) | same | same |
| Notes | invoice notes | same | invoice notes + `UEN: …` when present |
| HSN/SAC, Item Type, Quantity, Usage unit | SAC, `service`, 1, blank | same | same |
| Payment Terms / Label / Due Date | days between dates, `Net N` or `Due on Receipt`, due date | same | same |

## UI

- **Invoice detail page.** The existing button opens a small dialog instead of
  downloading at once: a pre-flight result list (green when clean), the
  "Import as Open" toggle, an exchange-rate input when the invoice is non-INR and has
  none yet, and a "Download CSV" action. A link to the in-app Zoho checklist.
- **Reports page.** A new "Export for Zoho Books" card beside Import/Export: brand,
  FY and month range, status checkboxes (defaults Sent + Paid, Draft off), then the
  same pre-flight + download. Produces `invoices-zoho-<range>.csv` and, in Phase 2,
  `customers-zoho-<range>.csv`.
- **Client form.** Country (select, default India), GST treatment (select, default
  "Infer"), Place of supply (state select, shown when no GSTIN), Zoho display name.
- **Brand form.** A "Zoho Books" section: export type (LUT / with payment), sales
  account name, default SAC.
- **Line items.** SAC column hidden behind a "Show SAC" toggle so the form stays as it is
  for anyone who never exports.
- **Checklist.** `/reports` gets a collapsible "Before your first Zoho import" section
  reproducing the Prerequisites list above.

## Implementation phases

**Phase 0 — Ground truth (user + 1 small commit).** In the real Zoho organisation:
download the invoice import sample file and the customer import sample file; import
the two test CSVs this branch will generate (one INR intra-state, one USD overseas) as
Draft; report the header diff and any rejected row. Code change: the four corrections
from findings 1–5 (state codes, `OT`, treatment tokens, explicit rate, `Draft`), with
tests. This alone makes the current button materially safer.

**Phase 1 — Hardened invoice export.** Vocabulary module, resolver, validator, CSV
writer with BOM/CRLF, data-model fields, client/brand form fields, detail-page dialog,
bulk export on Reports, in-app checklist. Full unit coverage of resolver and validator
(every row of the column table above is a test case) plus component tests for the two
dialogs.

**Phase 2 — Customers CSV.** Zoho Contacts import file for the clients in the
selected range, so contacts exist with GSTIN, treatment, Place of Contact, currency,
country and the UEN custom-field column before invoices are imported. Header list
confirmed from the Phase 0 sample file.

**Phase 3 — Payments CSV (optional).** For invoices marked paid, a Payments Received
import file (Customer Name, Payment Date = `paidOn`, Amount, Invoice Number, Amount
Applied to Invoice, Exchange Rate, Deposit To). Only after Phase 1 is proven in the
live organisation.

## Questions for the user before Phase 1

1. Which Zoho Books plan is the organisation on, and is multi-currency already enabled
   with USD and SGD?
2. Do you hold a valid LUT (export services without charging IGST), or do you export
   with payment of IGST?
3. Is e-invoicing (IRN) enabled in the organisation?
4. Which SAC code(s) do you bill under (e.g. 998314 IT design/development)?
5. Do you want the book exchange rate to be the one you type per invoice (recommended,
   matches what Skydo/your bank actually settled) or Zoho's feed rate on the invoice
   date?
6. Should "Paid" invoices be exported at all in bulk, and if so do you want the
   Phase 3 payments file?
7. Can you download the two sample files (Invoices and Customers import) from the
   organisation and drop them in `docs/zoho-samples/`? The sandbox cannot reach
   zoho.com, so header verification has to come from you.

## Appendix — API alternative (not planned)

`POST https://www.zohoapis.in/books/v3/invoices?organization_id=…` with
`customer_id`, `line_items[]` (`name`, `rate`, `quantity`, `tax_id`, `hsn_or_sac`),
`gst_treatment`, `place_of_supply`, `currency_id`, `exchange_rate`, `date`,
`due_date`, `payment_terms`. OAuth scopes `ZohoBooks.invoices.CREATE`,
`ZohoBooks.contacts.ALL`, `ZohoBooks.settings.READ`; India data centre
`accounts.zoho.in`; 100 requests/min/org and a daily cap by plan. Gives per-invoice
validation errors and avoids name matching, but needs a backend to hold the refresh
token. Revisit if Invoicer ever grows a server.
