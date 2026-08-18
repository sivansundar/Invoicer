# SaaS Foundation — auth, hosted data, landing page

**Date:** 2026-08-11
**Status:** Approved design, ready for implementation planning
**Baseline:** `main` @ `18d2a6f` — 455 tests passing, clean build, zero lint problems

---

## 1 — Context

Invoicer today is a local-first browser app. All state lives in `localStorage` behind
`src/lib/storage.ts`; there is no server, no account, and no tenancy. The v2 shadcn rewrite
(PR #6, merged 2026-08-08) delivered the full product surface — sidebar shell, brand-scoped
dashboard, invoice editor with live preview, two invoice designs, FY reports, backup
import/export, and a tested pure-logic layer under `src/lib/`.

Two areas are UI-complete facades, gated off in `src/lib/features.ts`:

- `billing: false` — plan card, Pro pills, upsell dialog, ₹499/mo. `usePlan().upgrade()`
  flips a `localStorage` flag. No payment is ever taken.
- `followups: false` — per-brand schedules, templates, queue, reminder history. No email is
  ever sent.

This spec turns Invoicer into a hosted, multi-tenant SaaS that people can sign up for and use.
It covers **only** the foundation. Billing and email each get their own spec later.

## 2 — Goal

A visitor lands on a marketing page, signs up, and uses the full existing product against
hosted data scoped to their account: brands, clients, invoices, status transitions, PDFs, and
FY reports.

## 3 — Scope

**In:**

| | |
|---|---|
| Auth | Supabase Auth — magic link + Google OAuth. No passwords |
| Tenancy | `orgs` + `org_members` in Postgres, auto-created 1:1 at signup. Solo UX |
| Data | Supabase Postgres, RLS-enforced, replacing `localStorage` entirely |
| Files | Supabase Storage for brand logos, content-addressed |
| Numbering | Transactional server-side invoice number allocation |
| Migration | One-time importer for existing `localStorage` users |
| Marketing | Landing page, pricing, privacy, terms, SEO |
| Ops | Sentry, PostHog, Resend as auth SMTP |

**Out (deliberately):**

- Billing / payments — `FEATURES.billing` stays `false`
- Transactional email and follow-ups — `FEATURES.followups` stays `false`
- Server-side PDF rendering (only needed once invoices are emailed)
- Team workspaces — schema supports them, UI does not expose them
- Local-only mode — **retired**. See §4.1

## 4 — Decisions and rationale

### 4.1 Cloud-only; local mode is retired

One code path. `localStorage` survives solely as a one-shot import source (§10), then is
never written again.

**Consequence:** the README's headline — *"A local-first invoicing tool. No accounts. No
servers. No subscriptions."* — becomes false. It must be rewritten as part of this work, not
after. The repo is MIT-licensed and publicly positioned as local-first; anyone who starred it
did so on that promise. The change is deliberate and should be stated plainly in the README
and in a release note, not slipped in.

### 4.2 Tenancy: solo UX, workspace-ready schema

Every domain row carries `org_id`. A trigger on `auth.users` insert creates an org and an
owner membership. No invite flow, no role UI, no org switcher ships.

Rationale: adding workspaces later becomes a UI feature rather than a data migration, at the
cost of one extra table and one join in the RLS helper. Retrofitting tenancy onto
`user_id`-scoped rows after launch means migrating live financial data — the thing worth
paying a small upfront cost to avoid.

### 4.3 Supabase for database, auth, and storage

Chosen over Clerk-for-auth and Cloudflare R2-for-files.

- **Not Clerk:** Clerk's organizations primitive is genuinely better, and its free tier
  (50k monthly users) makes cost a non-factor. But it adds a second vendor and moves every
  policy from `auth.uid()` to `auth.jwt()->>'sub'`. Revisit if workspaces become a committed
  roadmap item rather than a hedge.
- **Not R2:** R2's zero-egress pricing is superior, but brand logos are a few KB each, viewed
  by their owner. Supabase Storage enforces access with the same RLS the tables use; R2 has no
  per-user auth and would need presigned URLs or a Worker. **Revisit R2 when generated invoice
  PDFs are archived server-side** — larger objects, repeatedly downloaded, which is where zero
  egress actually pays. Storage sits behind a two-function seam, so the move is cheap.

### 4.4 Keep the storage seam; do not rewrite to RSC

`src/lib/storage.ts` was designed as a swappable seam (`plans/PLAN.md` names Convex as the
intended target). This cashes that in: the module keeps its function names and becomes async.
Components, forms, live preview, PDF rendering, and the entire tested pure-logic layer are
untouched.

Browser-side `supabase-js` is safe here precisely because RLS enforces tenancy in the
database, not in application code. Marketing and auth routes are new, so they are RSC from
birth.

Rejected: a full RSC + Server Actions rewrite. The invoice editor must stay client-side for
live preview regardless, so the result is hybrid either way — while re-litigating 455 tests'
worth of component wiring for no tenancy-safety gain over RLS.

## 5 — Architecture

### 5.1 Routes

```
src/app/
  (marketing)/              public · RSC · static · no Supabase client
    page.tsx                /
    pricing/page.tsx
    privacy/page.tsx
    terms/page.tsx
  (auth)/
    login/page.tsx          magic link + Google
    callback/route.ts       OAuth / OTP code exchange
  (app)/                    middleware-protected
    dashboard/page.tsx      /dashboard        ← was /
    invoices/…  brands/…  clients/…  reports/…
    followups/…             still gated by FEATURES.followups
```

**Breaking change:** the dashboard moves from `/` to `/dashboard`. Existing bookmarks break.
Signed-in users hitting `/` redirect to `/dashboard`.

### 5.2 Supabase clients

Three, per `@supabase/ssr`:

| Where | Factory |
|---|---|
| Browser components | `createBrowserClient` |
| Server components / route handlers | `createServerClient` with the cookie store |
| `proxy.ts` | `createServerClient` for session refresh |

**Next.js 16 renamed `middleware.ts` to `proxy.ts`** (exported function `proxy`, Node.js
runtime). `middleware.ts` still works but is deprecated and warns. This project is on
16.1.6, so use `proxy.ts`. Supabase's own docs now use "Proxy" for this file.

Rules, non-negotiable:

- **Never `getSession()` in server code** — it reads an unverified cookie.
- Routine authorization uses **`supabase.auth.getClaims()`**, which verifies the JWT locally
  against the JWKS endpoint when asymmetric signing keys are enabled — no network round trip
  per request. This is Supabase's current recommendation for the proxy.
- Use `supabase.auth.getUser()` where freshness beats latency: it always calls the auth
  server, so it is what detects a banned, deleted, or signed-out user immediately. Required
  before destructive account operations.
- **Enable asymmetric JWT signing keys (ES256)** on the project so `getClaims()` verifies
  locally. With the default HS256 it still works but is less efficient.
- In the proxy, nothing runs between `createServerClient` and the claims check.
- Cookies are handled with `getAll` / `setAll`, never the deprecated single-cookie API.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Publishable keys,
  not the legacy `anon` key. **The `service_role` key is not used in this phase and must never
  appear in a `NEXT_PUBLIC_` variable.**
- Pin exact versions of `@supabase/supabase-js` and `@supabase/ssr` and commit the lockfile —
  auth libraries are a supply-chain target.

## 6 — Database schema

Imperative migrations. `supabase init`, then `supabase migration new <name>` for each change —
never a hand-invented filename.

```sql
create extension if not exists pgcrypto;

-- Tenancy ------------------------------------------------------------------
create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.org_members (
  org_id   uuid not null references public.orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null default 'owner' check (role in ('owner','member')),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members (user_id);

-- Domain -------------------------------------------------------------------
create table public.brands (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  name               text not null,
  address            text not null default '',
  email              text,
  phone              text,
  gst_number         text,
  pan_number         text,
  logo_path          text,                    -- Storage object path; see §8
  bank_details       jsonb not null default '{}'::jsonb,
  invoice_prefix     text not null,
  accent_color       text not null,
  invoice_design     text not null default 'modern'
                       check (invoice_design in ('modern','classic')),
  followup           jsonb not null default '{}'::jsonb,   -- FEATURES.followups
  created_at         timestamptz not null default now()
);
create index brands_org_id_idx on public.brands (org_id);

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  company_name  text not null,
  name          text,
  address       text not null default '',
  email         text,
  phone         text,
  gst_number    text,
  created_at    timestamptz not null default now()
);
create index clients_org_id_idx on public.clients (org_id);

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  brand_id          uuid not null references public.brands(id) on delete restrict,
  client_id         uuid references public.clients(id) on delete set null,
  invoice_number    text not null,
  number_year       int,                      -- null when a legacy number won't parse
  number_seq        int,
  status            text not null default 'draft'
                      check (status in ('draft','sent','paid','overdue')),
  currency          text not null check (currency in ('INR','USD','SGD')),
  bill_date         date not null,
  due_date          date not null,
  paid_on           date,
  client_snapshot   jsonb not null,           -- InvoiceClient
  brand_snapshot    jsonb not null,           -- BrandSnapshot
  subtotal          numeric(14,2) not null default 0,
  total_tax         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  notes             text,
  reminders         date[] not null default '{}',   -- FEATURES.followups
  followups_paused  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_number_unique unique (brand_id, invoice_number),
  constraint invoices_seq_unique    unique (brand_id, number_year, number_seq)
);
create index invoices_org_id_idx     on public.invoices (org_id);
create index invoices_brand_id_idx   on public.invoices (brand_id);
create index invoices_client_id_idx  on public.invoices (client_id);
create index invoices_org_status_idx on public.invoices (org_id, status);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  position     int not null,
  description  text not null default '',
  amount       numeric(14,2) not null default 0,
  tax          numeric(5,2)  not null default 0
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create table public.email_templates (            -- FEATURES.followups
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  subject     text not null,
  tone        text not null check (tone in ('Friendly','Direct','Firm')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index email_templates_org_id_idx on public.email_templates (org_id);
```

Notes on the choices:

- **Money is `numeric(14,2)`, never float.** It is `number` in TypeScript today, which is fine
  in a browser and wrong in a ledger.
- **Line items are a real table, not `jsonb`** — money needs numeric typing, and per-line
  reporting is a plausible next feature. Supabase nested selects
  (`invoices(*, invoice_items(*))`) make it one round trip, so no N+1.
- **`brand_snapshot` / `client_snapshot` stay `jsonb`** — genuinely frozen blobs, never queried
  by field. Correct use of jsonb, and they mirror existing TypeScript types exactly.
- **UUID v4 PKs.** `bigint identity` has better index locality but leaks customer volume in
  URLs. At invoicing scale the fragmentation is immaterial. Upgrade to `uuidv7()` if the
  project's Postgres version exposes it.
- **`number_year`/`number_seq` are nullable** so unparseable legacy numbers can be imported.
  Postgres treats NULLs as distinct in unique indexes, so multiple such rows coexist;
  `invoices_number_unique` still prevents literal duplicate strings.
- **`on delete restrict` on `invoices.brand_id`** matches the existing app behaviour, which
  guard-refuses deleting a brand that has invoices.

### 6.1 Signup trigger

```sql
create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  insert into public.orgs (name)
  values (coalesce(new.raw_user_meta_data->>'full_name', 'My workspace'))
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

`raw_user_meta_data` is user-editable and is used here **only as a display name**, never for
authorization.

## 7 — Row Level Security

RLS is enabled and **forced** on every table in `public`. Tenancy is enforced by the database,
so a missed `.eq('org_id', …)` in application code cannot leak another user's invoices.

```sql
create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())     -- identity check inside the function
  );
$$;

revoke execute on function private.is_org_member(uuid)
  from public, anon, authenticated, service_role;
```

The function lives in a non-exposed schema and has `EXECUTE` revoked from every client role,
so it is not a callable API endpoint. RLS policy expressions evaluate with the table owner's
privileges, so policies can still call it.

Every org-scoped table gets the same four-part policy set:

```sql
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy invoices_update on public.invoices
  for update to authenticated
  using       ((select private.is_org_member(org_id)))
  with check  ((select private.is_org_member(org_id)));

create policy invoices_delete on public.invoices
  for delete to authenticated
  using ((select private.is_org_member(org_id)));
```

`invoice_items` has no `org_id`; it authorizes through its parent:

```sql
create policy invoice_items_all on public.invoice_items
  for all to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ))
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));
```

Rules that must hold everywhere, each guarding a specific failure:

| Rule | What it prevents |
|---|---|
| `(select …)` around every function call | the function being re-evaluated per row |
| `TO authenticated` **plus** an ownership predicate | BOLA/IDOR — role checks alone authorize nothing |
| UPDATE has both `USING` **and** `WITH CHECK` | a user reassigning a row's `org_id` to someone else |
| A SELECT policy exists wherever UPDATE does | UPDATE silently affecting 0 rows with no error |
| Never `auth.role()` | deprecated, and it passes for anonymous sign-ins |
| Never `user_metadata` in a policy | it is user-editable |
| Any view uses `WITH (security_invoker = true)` | views bypassing RLS by default |

After the migration lands, run `supabase db advisors` (or MCP `get_advisors`) and clear every
finding. Also confirm the Data API exposes the new tables — depending on project settings,
`anon`/`authenticated` may need an explicit `GRANT`, which is separate from RLS.

## 8 — Brand logos

> **Amended 2026-08-13, before Phase 3.** Two decisions below replace what this section
> originally said. Both are recorded rather than silently edited, because each looks like a
> mistake against the other's reasoning.

Private Storage bucket `brand-logos`. Objects are **content-addressed**:

```
brand-logos/{brand_id}/{sha256}.png
```

Replacing a logo writes a new object rather than overwriting one. Already-issued invoices keep
resolving the logo they were issued with, which preserves the immutability `BrandSnapshot`
already promises. A mutable path would silently rewrite the appearance of sent invoices.

### 8.1 Why the path is not keyed by `org_id`

This section originally specified `brand-logos/{org_id}/{brand_id}/{sha256}.png`, with policies
calling `private.is_org_member` on the first segment. That collides with the invariant Phase 2
was built on: **`org_id` never appears in application code.** Every table fills it from a column
default (`private.current_org_id()`); a Storage object path has no such default, so the client
would have to learn its own `org_id` and build the path from it.

Keying by `brand_id` removes the need:

```sql
using (
  exists (
    select 1 from public.brands b
    where b.id = ((storage.foldername(name))[1])::uuid
  )
)
```

Policy expressions evaluate with the **querying role's** privileges, so `brands`' own RLS filters
this subquery to the caller's org. The tenancy check is real, and no application code touches
`org_id`.

**This must be falsified, not assumed.** A policy that fails *open* looks identical to one that
works, and Phase 1 already shipped an RLS helper that was wrong in exactly this way. The
integration suite has to prove that user B, holding user A's brand UUID, can neither read nor
write an object under it.

The cost is org-wide erasure: deleting one prefix no longer removes an org's objects, so the
DPDP path must list the org's brands and delete per brand. Noted for the legal phase.

**Upsert needs INSERT + SELECT + UPDATE policies** — granting only INSERT makes replacement
fail silently.

### 8.2 `BrandSnapshot` carries a path *and* tolerates base64

`snapshotFromBrand` copies the logo into **every invoice's** frozen `brand_snapshot`, so the
bytes scale with invoice count, not brand count — the problem `MAX_LOGO_STORED_BYTES`
(`@/lib/brands`) exists to bound. Moving only `brands.logo_data` to Storage would relocate the
current logo and leave the bulk in Postgres.

So `BrandSnapshot` gains `logoPath?` and **keeps `logo?`**:

- New invoices snapshot the path. Bytes stop being duplicated into Postgres.
- Snapshots already holding base64 keep rendering from it. There is no backfill.

The dual path is not a transitional compromise — **§11's importer brings in pre-Postgres
invoices whose snapshots carry base64, indefinitely.** Renderers must tolerate both however this
was decided, so a backfill would not buy a single code path.

One resolver (`useLogoSrc`) serves both, so the branch lives in one place rather than in two
preview components and two PDF components.

`Brand.logo` stays a data URL in memory: the form must preview a file before it is uploaded.
Conversion happens at the seam.

Access is via `createSignedUrl`. One implementation detail: `@react-pdf/renderer` currently
embeds the base64 logo straight from the record. With Storage it must fetch the object and
convert it to a data URL before rendering, or PDF generation breaks. **The failure mode is a
missing logo on a document already sent**, so this gets a test rather than an eyeball.

`downsampleImage` re-encodes every upload through a canvas to PNG, so `.png` is accurate and no
SVG ever reaches the bucket — the inline-script caveat in `validateLogoFile` does not follow us
into Storage.

## 9 — Invoice numbering

**The bug being fixed:** `src/lib/numbering.ts:26` picks the next number with a client-side
`max()` over the local invoice list. With hosted data and two tabs or two devices, that issues
**duplicate invoice numbers on real, sent documents.**

Allocation moves into a transactional RPC. The body below is **illustrative** — it fixes the
locking strategy and the security mode, not the final SQL:

```sql
create or replace function public.create_invoice(payload jsonb)
returns public.invoices
language plpgsql
security invoker          -- RLS applies; the caller can only touch their own rows
as $$
declare
  v_brand   public.brands;
  v_year    int := extract(year from (payload->>'bill_date')::date);
  v_seq     int;
  v_invoice public.invoices;
begin
  -- Serialises concurrent creates for this brand. RLS restricts which brand
  -- rows are lockable at all.
  select * into v_brand from public.brands
   where id = (payload->>'brand_id')::uuid
   for update;

  if not found then
    raise exception 'brand not found';
  end if;

  select coalesce(max(number_seq), 0) + 1 into v_seq
    from public.invoices
   where brand_id = v_brand.id and number_year = v_year;

  -- Insert the invoice row and its invoice_items in this same transaction,
  -- returning the invoice into v_invoice. Items come from payload->'items'.
  return v_invoice;
end;
$$;
```

`unique (brand_id, number_year, number_seq)` is the hard backstop; the client retries once on
a unique violation.

`src/lib/numbering.ts` and its 67 lines of tests survive unchanged, demoted to rendering the
**provisional** number shown while drafting.

**Behaviour change to accept:** the number displayed in the editor is not guaranteed to be the
number assigned on save. Two people drafting simultaneously in the same org both see
`SC-2026-014`; the second to save gets `SC-2026-015`. The UI must show the server's answer
after save rather than assuming its own.

Legacy `SC2026001` numbers are stored verbatim in `invoice_number` and parsed into
`number_year`/`number_seq` where possible, so the sequence continues correctly instead of
restarting at 001.

## 10 — The client-side refactor

`src/lib/storage.ts` keeps every exported function name and returns promises. Hooks move to
TanStack Query with optimistic updates, so editing feels as immediate as `localStorage` did.

| Deleted | Rewritten | Untouched |
|---|---|---|
| `useSyncExternalStore` snapshot cache | `src/lib/storage.ts` | `money`, `dates`, `numbering`, `chart` |
| cross-tab `storage` event handler | 5 hooks in `src/hooks/` | `reports`, `invoice-validation`, `dashboard` |
| `local-storage.ts` quota toasts | per-screen loading states | `followups`, `palette`, `invoice-design` |
| | | every component, form, PDF, preview |

`src/lib/migrate.ts` is **not** deleted — the importer reuses it (§11).

**The hidden cost is loading states.** The app has almost none, because reads were
synchronous. Every list and detail screen needs a skeleton. `skeleton.tsx` is already
installed, but this is a per-screen pass and it is where this phase's time actually goes.

## 11 — Importing existing localStorage data

After first sign-in, a user with `invoicer_*` keys sees a one-time prompt:

> We found 14 invoices on this device. Import them into your account?

The flow reuses machinery that already exists and is tested: `import-validation.ts` to
validate, `migrate.ts` to normalise v1→v2, then upload.

**Local data is not deleted after import.** A separate "clear local copy" action appears once
the user has verified the result. Deleting someone's only copy of their invoices on the
strength of an upload nobody has confirmed is not a risk worth taking.

> **Amended 2026-08-13, before Phase 3.**

Phase 2 built the rest of this pipeline for backup restore and it is already tested:
`remapNonUuidIds` (`@/lib/import-remap`) rewrites legacy non-uuid ids and follows their
references, and `buildBackup`/the import path in `import-export.tsx` runs validate → normalise →
default `currency` → remap → write. The prompt reuses that path; it does not grow a second one.

**Dismissal is tracked in `localStorage`, not the database.** The prompt is about *this device's*
data. A database flag would silently suppress it on a second browser holding different local
data — which is the one case where asking again is correct.

Two limitations carried from Phase 2's import work apply here unchanged and are stated in
`docs/PHASE3-CARRYOVER.md`: importing the same data twice duplicates records whose ids were
rewritten, and import is not all-or-nothing because conflict resolution spans interactive dialog
round-trips.

Phase 2 deliberately stopped touching local data — `Shell` no longer runs the v1→v2 migration on
mount, because that rewrote a user's local copy before they had chosen to bring it into their
account. For anyone still on the old build that is their only copy. **Nothing in this phase may
write to `invoicer_*` keys either.**

## 12 — Landing page

Marketing routes are static RSC — no Supabase client, no client bundle, indexable.

The hero renders **`invoice-preview.tsx` with real seeded data**, not a screenshot. It is a
live component the project already owns, it looks good, and it demonstrates the product above
the fold.

Below it: feature sections describing only what actually works (nothing about billing or
follow-ups, which do not exist), pricing showing Free with Pro marked *coming soon*, FAQ,
footer.

Also required:

- `sitemap.ts` and `robots.ts`
- Per-page metadata
- **Set `metadataBase` in `src/app/layout.tsx`.** The production build currently warns that it
  is unset, so OG and Twitter images resolve against `http://localhost:3000` — social previews
  would be broken at launch.

## 13 — Integrations

**At launch:**

| Concern | Choice | Note |
|---|---|---|
| DB / Auth / Storage | Supabase | Pro tier from day one — the free tier pauses a project after 7 days of inactivity, which will bite a slow launch |
| Hosting | Vercel | decide the fate of `Dockerfile` / `docker-compose.yml` / `output: standalone` |
| Auth email | Resend as Supabase's custom SMTP | Supabase's built-in sender is rate-limited and **not for production magic links** — login would fail at the worst moment |
| Errors | Sentry | there is currently zero server-side visibility |
| Analytics | PostHog | landing → signup → first-invoice funnel. Its feature flags could later replace `src/lib/features.ts` |

**Deferred, with the trigger for each:**

| Concern | Choice | Trigger |
|---|---|---|
| Billing | **Razorpay** for INR/UPI/GST invoicing; **Stripe** if global. Stripe has real restrictions for Indian entities selling domestically | once there is evidence of what people will pay for |
| Transactional email | Resend / Postmark | with follow-ups |
| Server-side PDF | `@react-pdf/renderer` in a Node route | the moment an invoice is emailed |
| Follow-up scheduler | Supabase `pg_cron` + Edge Function, or Vercel Cron | with follow-ups |
| **Payment collection on invoices** | Razorpay payment links | likely the strongest Pro feature — a "Pay now" button on the invoice, worth more than any UI limit |
| GST / Tally / Zoho export | CSV | high value for Indian filing, low build cost |
| E-invoicing (GST IRN) | NIC IRP via a GSP | only above the ₹5cr turnover threshold. Heavy regulatory lift |

**Not needed:** CMS, queue, Redis, separate API service.

## 14 — Testing

| Layer | Approach |
|---|---|
| Pure logic (`src/lib/*`) | Unchanged. All 455 existing tests must stay green |
| Hooks / components | Mocked Supabase client; assert query keys, optimistic updates, and rollback |
| **RLS** | **New and critical.** Integration tests that sign in as two real users and assert every cross-tenant read returns zero rows and every cross-tenant write is rejected — per table, per operation |
| Numbering | Concurrent `create_invoice` calls against the same brand must never produce a duplicate |
| Advisors | `supabase db advisors` clean before each migration is committed |

RLS tests are the one category where absence of a test means absence of the security property.
They gate the phase.

## 15 — Launch gates

Blocking. Not post-launch cleanup.

- [ ] Privacy policy and terms pages published (routes already in `(marketing)`)
- [ ] **India DPDP Act**: consent capture at signup, stated retention policy, working data
      export, working account deletion. The existing backup/export feature covers most of the
      export duty; deletion is new and must cascade through `orgs`
- [ ] Backup and restore procedure **tested by actually restoring**
- [ ] Cookie / analytics consent decided before PostHog goes live
- [ ] README repositioned — the local-first claim removed, the hosted model stated
- [ ] Deleting a user revokes their sessions first (deleting a user does **not** invalidate
      existing access tokens)

## 16 — Sequencing

| Phase | Work |
|---|---|
| 0 | ✅ Done — synced to `18d2a6f`, 455 tests green, clean build, zero lint |
| 1 | Supabase project, schema, RLS, advisors clean, **RLS tests as two users** |
| 2 | Auth: route groups, middleware, `/login`, real user in the sidebar (static today) |
| 3 | Storage seam → async + TanStack Query + skeletons ← **largest phase** |
| 4 | Logos → Storage; numbering → RPC |
| 5 | `localStorage` importer |
| 6 | Landing page, SEO, `metadataBase`, PostHog, Sentry |
| 7 | Launch gates (§15), then launch |

**How this maps to what actually shipped.** Branches did not land one-per-row — phases 1 and 2
went together because auth is untestable without the schema, and the numbering RPC moved up out
of phase 4 because phase 3's seam had to call it rather than be rewritten later.

| Branch | Spec phases | Landed as |
|---|---|---|
| `feat/saas-phase1-auth` | 1 + 2 | PR #7 → `v1` |
| `feat/saas-phase2-data` | 3, plus numbering from 4 | PR #8 → `v1` |
| `feat/saas-phase3-logos-import` | rest of 4 (logos), 5 | in progress |
| — | 6 | not started |
| — | 7 | not started |

Reconcile against the branch column, not the phase numbers.

## 17 — Risks

1. ~~**Phase 3 is the schedule risk.**~~ **Retired** — shipped in PR #8. The estimate held, but
   the loading-state pass was not where the time went: it went into discovering that three
   separate tests passed for the wrong reason. See the process note in
   `docs/PHASE3-CARRYOVER.md`.
2. **`/` → `/dashboard` breaks existing bookmarks.** Unavoidable once the landing page owns
   the root.
3. ~~**Retiring local-only mode contradicts the repo's public promise.**~~ **Partly addressed** —
   PR #8 rewrote the README, removing "your data never leaves your machine" and adding a
   migration section. Still owed: telling existing users, which the §11 prompt is the vehicle
   for.
4. **You will be holding other people's financial data.** §15 is not optional and not a
   launch-day scramble.
5. **The provisional-invoice-number behaviour change** (§9) is subtle and user-visible. Worth
   an explicit note in the UI.
6. **`docs/POST-MERGE-NOTES.md` residuals** are unaffected by this work but still open — dead
   `Brand.nextInvoiceNumber`, no confirmation on client delete, two stray `alert()` calls, a
   dangling default `templateId`. Client delete rewrites `clientId` on every referencing
   invoice; with hosted data that becomes a server-side cascade worth getting right.

## 18 — Open questions

None blocking. Deferred by design: billing provider (Razorpay vs Stripe) and whether the
self-hosted Docker path is kept or removed.
