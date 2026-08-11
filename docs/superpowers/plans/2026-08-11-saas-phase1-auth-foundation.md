# SaaS Phase 1 — Supabase Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Supabase project with a fully RLS-enforced multi-tenant schema, and put the existing app behind real authentication — sign up, sign in, sign out, with the signed-in user shown in the sidebar.

**Architecture:** Postgres owns tenancy. Every domain row carries `org_id`; an `auth.users` insert trigger creates one org and one owner membership per signup. RLS policies on every table delegate to a `SECURITY DEFINER` helper in a non-exposed `private` schema, so a missed filter in application code cannot leak another tenant's data. On the client, three `@supabase/ssr` factories (browser, server, proxy) handle sessions via cookies. **This phase does not move any app data to Postgres** — the app still reads and writes `localStorage`. That is Phase 2's plan. The deliverable here is: the schema exists and is proven isolated, and you cannot reach the app without signing in.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript, Supabase (Postgres + Auth), `@supabase/ssr`, `@supabase/supabase-js`, Supabase CLI, Docker, vitest.

**Source spec:** `docs/superpowers/specs/2026-08-11-saas-foundation-design.md` (§5, §6, §7, and Phases 1–2 of §16).

## Global Constraints

Every task's requirements implicitly include this section.

**Baseline.** Branch from `main` @ `18d2a6f`: **455 tests passing, clean build, zero lint problems.** Every task must leave all three true. "Lint passes" means the problem count does not go up from zero.

**Verification for every task:** `npx tsc --noEmit` passes, `npm run lint` reports zero problems, `npm test` reports 455+ passing.

**Next.js 16 file conventions:**
- Request interception goes in **`src/proxy.ts`, exporting `proxy`** — not `middleware.ts` exporting `middleware`. `middleware.ts` is deprecated in Next.js 16 and emits a warning. `proxy.ts` runs on the Node.js runtime.
- **The path is `src/proxy.ts`, not the repo root.** This project uses a `src/` layout, and Next.js resolves the proxy relative to the app directory's parent (`appDir/..` → `src/`). A `proxy.ts` at the true repo root is **never detected**, and — this is what makes it dangerous — it fails *silently*: no error, no warning, no `ƒ Proxy (Middleware)` line in the build output. The auth guard simply does not run and every protected route returns 200. Verified empirically: root placement → `/brands` returns 200 signed out; `src/proxy.ts` → 307 redirect to `/login?next=%2Fbrands`.

**Supabase CLI:** must be **≥ 2.81.3**. The machine currently has **2.62.5**, which is too old — `supabase db query` needs ≥ 2.79.0 and `supabase db advisors` needs ≥ 2.81.3. Task 1 upgrades it. Never invent a migration filename; always use `supabase migration new <name>`.

**SQL conventions:**
- Lowercase identifiers throughout. No quoted mixed-case names.
- Money is `numeric(14,2)`. **Never** `float`/`real`/`double precision`.
- Every foreign key column gets an index. Postgres does not create them automatically.
- `add constraint if not exists` is not valid Postgres. Use a `do $$ … end $$` guard.

**RLS rules — each one prevents a specific, silent failure:**

| Rule | Prevents |
|---|---|
| RLS `enable`d **and** `force`d on every table in `public` | table owner bypassing policies |
| Wrap every function call as `(select fn(…))` | the function being re-evaluated once per row |
| `to authenticated` **plus** an ownership predicate in `using` | BOLA/IDOR — a role check authorizes nothing on its own |
| `update` policies declare both `using` **and** `with check` | a user reassigning a row's `org_id` to another tenant |
| A `select` policy exists wherever an `update` policy does | `update` silently affecting 0 rows with no error |
| Never `auth.role()` | deprecated, and it passes for anonymous sign-ins |
| Never `raw_user_meta_data` / `user_metadata` in a policy | it is user-editable |
| Any view declares `with (security_invoker = true)` | views bypassing RLS by default |
| `security definer` functions live in `private`, check `auth.uid()` internally, and have `execute` revoked from `public, anon, authenticated, service_role` | a public, unauthenticated RPC endpoint |

**Policy repetition is deliberate (ruled 2026-08-11).** Task 4 writes the same four-policy block out once per table rather than generating it in a `do $$ … end $$` loop, and repeats the `exists(…)` subquery in each `invoice_items` policy. This is not an oversight and is not to be refactored:

- Policies are named database objects, not functions. Each one is independently greppable and shows up in `\dp <table>` under a predictable name.
- A `format()`-driven generator turns the security surface into dynamically built strings — harder to read under review, and one typo silently mis-applies to every table.
- The moment one table needs a different predicate, a loop has to be unwound anyway.

**Auth rules:**
- **Never `getSession()` in server code** — it reads an unverified cookie.
- Routine authorization uses `getClaims()` (verifies locally against JWKS). Use `getUser()` only where freshness beats latency — it always calls the auth server.
- Nothing runs between `createServerClient` and the claims check inside `proxy.ts`.
- Cookies use `getAll` / `setAll`, never the deprecated single-cookie API.

**Secrets:**
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only. Publishable key, not the legacy `anon` key.
- **The `service_role` key must never appear in a `NEXT_PUBLIC_` variable or in application code.** It appears only in `.env.test.local`, used by integration tests.
- `.env.local` and `.env.test.local` are gitignored. `.env.local.example` is committed with placeholder values.

**Dependencies:** pin exact versions of `@supabase/supabase-js` and `@supabase/ssr` (no `^`) and commit `package-lock.json`. Auth libraries are a supply-chain target.

**Commits:** one per task, conventional-commit prefix, ending with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**New — Supabase local project:**

| File | Responsibility |
|---|---|
| `supabase/config.toml` | Local stack config; enables password auth for tests only |
| `supabase/migrations/*_tenancy.sql` | `orgs`, `org_members`, signup trigger |
| `supabase/migrations/*_domain_tables.sql` | `brands`, `clients`, `invoices`, `invoice_items`, `email_templates` |
| `supabase/migrations/*_rls_policies.sql` | `private.is_org_member`, policies on all seven tables |
| `supabase/migrations/*_data_api_grants.sql` | Explicit `grant`s to `anon`/`authenticated` |

**New — client factories:**

| File | Responsibility |
|---|---|
| `src/lib/supabase/client.ts` | Browser client (`createBrowserClient`) |
| `src/lib/supabase/server.ts` | Server client bound to the Next.js cookie store |
| `src/lib/supabase/proxy.ts` | Session-refresh helper used by `src/proxy.ts` |
| `src/proxy.ts` | Request interceptor: refresh session, guard `(app)` routes. **`src/`, not the repo root** — see Global Constraints |

**New — auth surface:**

| File | Responsibility |
|---|---|
| `src/app/(auth)/login/page.tsx` | Magic-link + Google sign-in form |
| `src/app/(auth)/callback/route.ts` | Exchanges the auth code for a session |
| `src/app/(app)/layout.tsx` | Server-side auth guard, defence in depth behind the proxy |
| `src/components/layout/user-menu.tsx` | Replaces the static sidebar user row; sign-out |

**New — test infrastructure:**

| File | Responsibility |
|---|---|
| `vitest.integration.config.ts` | Node-environment vitest project for DB tests |
| `src/test/integration/helpers.ts` | Admin client, `makeUser()`, unique-email generation |
| `src/test/integration/tenancy.test.ts` | Signup trigger behaviour |
| `src/test/integration/schema.test.ts` | Constraint enforcement |
| `src/test/integration/rls.test.ts` | Cross-tenant isolation, per table, per operation |

**Modified:**

| File | Change |
|---|---|
| `package.json` | Supabase deps; `test:integration`, `db:*` scripts |
| `vitest.config.ts` | Exclude `src/test/integration/**` from the unit run |
| `.gitignore` | `.env.local`, `.env.test.local` |
| `src/app/page.tsx` → `src/app/(app)/dashboard/page.tsx` | Dashboard moves off `/` |
| `src/app/{brands,clients,invoices,reports,followups}/**` | Move into `(app)/` |
| `src/components/layout/app-sidebar.tsx` | `/` → `/dashboard`; static user row → `<UserMenu/>` |
| `src/components/layout/site-header.tsx` | `getCrumb` / `showNewInvoiceAction` use `/dashboard` |
| `src/components/layout/site-header.test.ts` | Updated expectations |
| `src/components/invoices/invoice-form.tsx:309,318` | `/` → `/dashboard` |
| `src/app/(app)/invoices/[id]/page.tsx:186,196` | `/` → `/dashboard` |
| `src/app/(app)/brands/page.tsx:57` | `/` → `/dashboard` |
| `src/app/(app)/followups/**` (3 files) | `router.replace("/")` → `"/dashboard"` |

---

## Task 1: Local Supabase stack and client factories

**Files:**
- Create: `supabase/config.toml` (generated), `.env.local.example`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `vitest.integration.config.ts`, `src/test/integration/helpers.ts`, `src/test/integration/connection.test.ts`
- Modify: `package.json`, `vitest.config.ts`, `.gitignore`

**Interfaces:**
- Produces: `createClient()` from `@/lib/supabase/client`; `createServerSupabase()` from `@/lib/supabase/server`; `admin`, `makeUser(): Promise<TestUser>`, `uniqueEmail(): string` from `src/test/integration/helpers`.
- `TestUser` is `{ client: SupabaseClient; userId: string; orgId: string; email: string }`.

- [ ] **Step 1: Upgrade the Supabase CLI and confirm Docker**

```bash
brew upgrade supabase   # or: npm i -g supabase@latest
supabase --version      # must print >= 2.81.3
docker --version        # must succeed; the local stack needs it
```

- [ ] **Step 2: Initialise and start the local stack**

```bash
supabase init
supabase start
supabase status -o env
```

`supabase status -o env` prints `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`. Keep the output — the next step needs it.

- [ ] **Step 3: Install pinned dependencies**

```bash
npm install --save-exact @supabase/supabase-js @supabase/ssr
```

Verify `package.json` shows exact versions with no `^` prefix.

- [ ] **Step 4: Write the env files**

Create `.env.local.example` (committed):

```bash
# Local: get real values from `supabase status -o env`
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-me
```

Create `.env.test.local` (NOT committed) with the values from Step 2:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase status>
```

Create `.env.local` (NOT committed) with the two `NEXT_PUBLIC_` values.

`.gitignore` already contains `.env*`, so both secret files are ignored with no change needed.
But that same pattern also swallows `.env.local.example`, which **must** be committed. Add the
negation directly under the existing `.env*` line:

```
# env files (can opt-in for committing if needed)
.env*
!.env.local.example
```

Confirm it worked before moving on — a silently-ignored example file is the kind of thing
nobody notices until a new machine has nothing to copy from:

```bash
git check-ignore -v .env.local .env.test.local   # both must report a match
git check-ignore -v .env.local.example           # must report NO match (exit 1)
```

- [ ] **Step 5: Enable password auth for local tests only**

In `supabase/config.toml`, under `[auth.email]`, confirm:

```toml
[auth.email]
enable_signup = true
enable_confirmations = false
```

This is a **local-only affordance** so integration tests can sign in with a password. Production uses magic link + Google exclusively; this file configures the local stack only.

Restart to apply: `supabase stop && supabase start`

- [ ] **Step 6: Write the browser client factory**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Safe to use from client components: the
 * publishable key grants nothing on its own, because every table's RLS
 * policies scope reads and writes to the caller's org.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

- [ ] **Step 7: Write the server client factory**

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to the request's cookie store.
 *
 * `setAll` throws when called from a Server Component (which cannot write
 * cookies). That is expected and safe to swallow: `proxy.ts` refreshes the
 * session on every request, so the cookies are already current by the time
 * a Server Component reads them.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component — proxy.ts already refreshed these.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 8: Add the integration vitest config**

`vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    envDir: process.cwd(),
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`fileParallelism: false` keeps concurrent suites from racing on the shared local database.

- [ ] **Step 9: Exclude integration tests from the unit run**

Modify `vitest.config.ts` — add an `exclude` alongside the existing `test` options:

```ts
    exclude: ["node_modules/**", "src/test/integration/**"],
```

The unit suite must keep running without Docker.

- [ ] **Step 10: Add npm scripts**

In `package.json` `"scripts"`:

```json
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
```

- [ ] **Step 11: Write the integration test helpers**

`src/test/integration/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !PUBLISHABLE_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Integration tests need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and " +
      "SUPABASE_SERVICE_ROLE_KEY in .env.test.local. Run `supabase status -o env`."
  );
}

/** Bypasses RLS. Test setup only — never import this from application code. */
export const admin = createClient(URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "integration-test-password-1";

export function uniqueEmail(): string {
  return `test-${randomUUID()}@example.test`;
}

export interface TestUser {
  client: SupabaseClient;
  userId: string;
  orgId: string;
  email: string;
}

/**
 * Creates a confirmed user, signs them in, and returns a client carrying
 * their access token — so every query it makes is subject to RLS exactly as
 * the real app's queries are.
 *
 * Tests never reset the database. Each user is unique, so suites are
 * independent without needing a clean slate.
 */
export async function makeUser(): Promise<TestUser> {
  const email = uniqueEmail();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  const userId = created.user.id;

  const client = createClient(URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  const { data: membership, error: orgError } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .single();
  if (orgError) throw orgError;

  return { client, userId, orgId: membership.org_id, email };
}
```

> `makeUser` reads `org_members`, which Task 2 creates. Until then only `connection.test.ts` runs.

- [ ] **Step 12: Write the failing connection test**

`src/test/integration/connection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { admin } from "./helpers";

describe("local Supabase stack", () => {
  it("is reachable with the service role key", async () => {
    const { data, error } = await admin.auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
```

- [ ] **Step 13: Run it**

Run: `npm run test:integration`
Expected: PASS. A failure here means the stack is not running or `.env.test.local` is wrong — fix before continuing.

- [ ] **Step 14: Confirm the unit suite is unaffected**

Run: `npm test`
Expected: 455 passed.

- [ ] **Step 15: Commit**

```bash
git add supabase/config.toml .env.local.example .gitignore package.json \
        package-lock.json vitest.config.ts vitest.integration.config.ts \
        src/lib/supabase src/test/integration
git commit -m "feat(supabase): local stack, client factories and integration test harness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Tenancy tables and the signup trigger

**Files:**
- Create: `supabase/migrations/<ts>_tenancy.sql`, `src/test/integration/tenancy.test.ts`

**Interfaces:**
- Consumes: `admin`, `makeUser`, `uniqueEmail` from `src/test/integration/helpers`.
- Produces: tables `public.orgs(id uuid, name text, created_at timestamptz)` and `public.org_members(org_id uuid, user_id uuid, role text)`; schema `private`; trigger `on_auth_user_created`.

- [ ] **Step 1: Write the failing test**

`src/test/integration/tenancy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { admin, uniqueEmail } from "./helpers";

describe("signup trigger", () => {
  it("creates exactly one org and one owner membership per new user", async () => {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = created!.user.id;

    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId);

    expect(memberships).toHaveLength(1);
    expect(memberships![0].role).toBe("owner");

    const { data: org } = await admin
      .from("orgs")
      .select("id, name")
      .eq("id", memberships![0].org_id)
      .single();

    expect(org).not.toBeNull();
    expect(org!.name).toBe("My workspace");
  });

  it("cascades the membership away when the user is deleted", async () => {
    const { data: created } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    const userId = created!.user.id;

    await admin.auth.admin.deleteUser(userId);

    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);

    expect(memberships).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- tenancy`
Expected: FAIL — relation `public.org_members` does not exist.

- [ ] **Step 3: Create the migration file**

```bash
supabase migration new tenancy
```

Use the generated filename. Do not invent one.

- [ ] **Step 4: Write the migration**

Into the new `supabase/migrations/<ts>_tenancy.sql`:

```sql
create extension if not exists pgcrypto;

create schema if not exists private;

create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.org_members (
  org_id   uuid not null references public.orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null default 'owner' check (role in ('owner', 'member')),
  primary key (org_id, user_id)
);

-- The PK already indexes (org_id, user_id); this covers lookups by user,
-- which is the direction every RLS check reads.
create index org_members_user_id_idx on public.org_members (user_id);

/**
 * Creates one org and one owner membership for each new user.
 *
 * `security definer` because it writes to public tables from a trigger on
 * `auth.users`, where the inserting role has no rights. `search_path = ''`
 * forces every reference to be schema-qualified, so the function cannot be
 * hijacked by a shadowing object in a caller-controlled schema.
 *
 * `raw_user_meta_data` is user-editable, so it is used here ONLY as a
 * display name — never for any authorization decision.
 */
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
  values (coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    'My workspace'
  ))
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Supabase CLI 2.113+ ships `auto_expose_new_tables = false` (matching the
-- current cloud default; the flag itself is deprecated and removed
-- 2026-10-30), so a new table in `public` carries NO role grants at all.
--
-- `service_role` bypasses RLS but that is orthogonal to table-level
-- privileges — without this grant even the service-role admin client used by
-- the integration tests gets `permission denied for table org_members`
-- (SQLSTATE 42501).
--
-- Only `service_role` is granted here. The `anon`/`authenticated` exposure
-- surface is deliberately consolidated into one reviewable migration in
-- Task 5, so "who can reach this data" is decided in a single place rather
-- than scattered across every table migration.
grant usage on schema public to service_role;
grant all on public.orgs, public.org_members to service_role;
```

- [ ] **Step 5: Apply and re-run the test**

```bash
supabase db reset      # replays all migrations from scratch
npm run test:integration -- tenancy
```

Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/test/integration/tenancy.test.ts
git commit -m "feat(db): orgs, org_members and the signup trigger

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Domain tables and constraints

**Files:**
- Create: `supabase/migrations/<ts>_domain_tables.sql`, `src/test/integration/schema.test.ts`

**Interfaces:**
- Consumes: `admin`, `makeUser` from helpers; `public.orgs` from Task 2.
- Produces: tables `public.brands`, `public.clients`, `public.invoices`, `public.invoice_items`, `public.email_templates`, with the columns given in spec §6.

- [ ] **Step 1: Write the failing test**

`src/test/integration/schema.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

let user: TestUser;

async function insertBrand(overrides: Record<string, unknown> = {}) {
  return admin
    .from("brands")
    .insert({
      org_id: user.orgId,
      name: "Acme Studio",
      invoice_prefix: "AC",
      accent_color: "#2563eb",
      ...overrides,
    })
    .select()
    .single();
}

beforeAll(async () => {
  user = await makeUser();
});

describe("domain schema", () => {
  it("round-trips a money value without precision loss", async () => {
    const { data: brand } = await insertBrand();
    const { data: invoice, error } = await admin
      .from("invoices")
      .insert({
        org_id: user.orgId,
        brand_id: brand!.id,
        invoice_number: "AC-2026-001",
        number_year: 2026,
        number_seq: 1,
        currency: "INR",
        bill_date: "2026-08-11",
        due_date: "2026-09-10",
        client_snapshot: { companyName: "Client Co" },
        brand_snapshot: { name: "Acme Studio" },
        total: "12345678.91",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(Number(invoice!.total)).toBe(12345678.91);
  });

  it("rejects an unknown status", async () => {
    const { data: brand } = await insertBrand();
    const { error } = await admin.from("invoices").insert({
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-002",
      status: "archived",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    });
    expect(error).not.toBeNull();
  });

  it("rejects a duplicate invoice number within one brand", async () => {
    const { data: brand } = await insertBrand();
    const row = {
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-010",
      number_year: 2026,
      number_seq: 10,
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    };
    const first = await admin.from("invoices").insert(row);
    expect(first.error).toBeNull();

    const second = await admin.from("invoices").insert(row);
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505"); // unique_violation
  });

  it("allows the same invoice number under a different brand", async () => {
    const a = await insertBrand({ invoice_prefix: "AA" });
    const b = await insertBrand({ invoice_prefix: "BB" });
    const row = {
      org_id: user.orgId,
      invoice_number: "SHARED-001",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    };
    expect((await admin.from("invoices").insert({ ...row, brand_id: a.data!.id })).error).toBeNull();
    expect((await admin.from("invoices").insert({ ...row, brand_id: b.data!.id })).error).toBeNull();
  });

  it("refuses to delete a brand that still has invoices", async () => {
    const { data: brand } = await insertBrand();
    await admin.from("invoices").insert({
      org_id: user.orgId,
      brand_id: brand!.id,
      invoice_number: "AC-2026-020",
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: {},
      brand_snapshot: {},
    });

    const { error } = await admin.from("brands").delete().eq("id", brand!.id);
    expect(error).not.toBeNull(); // on delete restrict
  });

  it("cascades invoice_items when the invoice is deleted", async () => {
    const { data: brand } = await insertBrand();
    const { data: invoice } = await admin
      .from("invoices")
      .insert({
        org_id: user.orgId,
        brand_id: brand!.id,
        invoice_number: "AC-2026-030",
        currency: "INR",
        bill_date: "2026-08-11",
        due_date: "2026-09-10",
        client_snapshot: {},
        brand_snapshot: {},
      })
      .select()
      .single();

    await admin.from("invoice_items").insert({
      invoice_id: invoice!.id,
      position: 0,
      description: "Design work",
      amount: "1000.00",
      tax: "18.00",
    });

    await admin.from("invoices").delete().eq("id", invoice!.id);

    const { data: items } = await admin
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", invoice!.id);
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- schema`
Expected: FAIL — relation `public.brands` does not exist.

- [ ] **Step 3: Create the migration file**

```bash
supabase migration new domain_tables
```

- [ ] **Step 4: Write the migration**

```sql
create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null,
  address         text not null default '',
  email           text,
  phone           text,
  gst_number      text,
  pan_number      text,
  -- Storage object path, not base64. Populated in a later phase.
  logo_path       text,
  bank_details    jsonb not null default '{}'::jsonb,
  invoice_prefix  text not null,
  accent_color    text not null,
  invoice_design  text not null default 'modern'
                    check (invoice_design in ('modern', 'classic')),
  -- FEATURES.followups is off; the column exists so the shape is stable.
  followup        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
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
  -- Nullable so a legacy number that will not parse can still be imported.
  -- Postgres treats nulls as distinct in a unique index, so several such
  -- rows coexist while invoices_number_unique still blocks literal dupes.
  number_year       int,
  number_seq        int,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'paid', 'overdue')),
  currency          text not null check (currency in ('INR', 'USD', 'SGD')),
  bill_date         date not null,
  due_date          date not null,
  paid_on           date,
  client_snapshot   jsonb not null,
  brand_snapshot    jsonb not null,
  subtotal          numeric(14,2) not null default 0,
  total_tax         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  notes             text,
  reminders         date[] not null default '{}',
  followups_paused  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_number_unique unique (brand_id, invoice_number),
  constraint invoices_seq_unique unique (brand_id, number_year, number_seq)
);
create index invoices_org_id_idx on public.invoices (org_id);
create index invoices_brand_id_idx on public.invoices (brand_id);
create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_org_status_idx on public.invoices (org_id, status);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  position     int not null,
  description  text not null default '',
  amount       numeric(14,2) not null default 0,
  tax          numeric(5,2) not null default 0
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  subject     text not null,
  tone        text not null check (tone in ('Friendly', 'Direct', 'Firm')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index email_templates_org_id_idx on public.email_templates (org_id);

-- Same reason as the tenancy migration: new `public` tables carry no role
-- grants under `auto_expose_new_tables = false`, and `service_role`'s
-- BYPASSRLS does not substitute for table privileges. Without this the
-- integration tests in this task fail with `permission denied` before they
-- can assert anything. `anon`/`authenticated` grants stay in Task 5.
grant all on
  public.brands,
  public.clients,
  public.invoices,
  public.invoice_items,
  public.email_templates
to service_role;
```

- [ ] **Step 5: Apply and re-run**

```bash
supabase db reset
npm run test:integration -- schema
```

Expected: PASS, all six tests.

- [ ] **Step 6: Verify the money column types against the catalogue**

The round-trip test above cannot distinguish `numeric` from `double precision` —
`Number("12345678.91")` is the same either way. The column type is what actually matters, so
check it directly:

```bash
supabase db query "
  select table_name, column_name, data_type, numeric_precision, numeric_scale
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('subtotal','total_tax','total','amount','tax')
  order by table_name, column_name;
"
```

Expected: every row reports `data_type = numeric`. `subtotal`, `total_tax`, `total` and
`amount` are precision 14 scale 2; `tax` is precision 5 scale 2. **Any row reporting
`double precision` or `real` is a bug in the migration** — fix it before committing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/test/integration/schema.test.ts
git commit -m "feat(db): brands, clients, invoices, invoice_items, email_templates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: RLS helper and policies

This is the security-critical task. Every table gets policies, and the tests prove isolation rather than assuming it.

**Files:**
- Create: `supabase/migrations/<ts>_rls_policies.sql`, `src/test/integration/rls.test.ts`

**Interfaces:**
- Consumes: all tables from Tasks 2–3; `makeUser` from helpers.
- Produces: `private.is_org_member(uuid) returns boolean`; RLS enabled, forced, and policied on all seven public tables.

- [ ] **Step 1: Write the failing test**

`src/test/integration/rls.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeUser, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let aliceBrandId: string;
let aliceInvoiceId: string;

beforeAll(async () => {
  alice = await makeUser();
  bob = await makeUser();

  const { data: brand, error: brandError } = await alice.client
    .from("brands")
    .insert({
      org_id: alice.orgId,
      name: "Alice Studio",
      invoice_prefix: "AL",
      accent_color: "#2563eb",
    })
    .select()
    .single();
  if (brandError) throw brandError;
  aliceBrandId = brand.id;

  const { data: invoice, error: invoiceError } = await alice.client
    .from("invoices")
    .insert({
      org_id: alice.orgId,
      brand_id: aliceBrandId,
      invoice_number: "AL-2026-001",
      number_year: 2026,
      number_seq: 1,
      currency: "INR",
      bill_date: "2026-08-11",
      due_date: "2026-09-10",
      client_snapshot: { companyName: "Alice Client" },
      brand_snapshot: { name: "Alice Studio" },
      total: "5000.00",
    })
    .select()
    .single();
  if (invoiceError) throw invoiceError;
  aliceInvoiceId = invoice.id;
});

describe("a user can reach their own rows", () => {
  it("reads their own brand and invoice", async () => {
    const { data: brands } = await alice.client.from("brands").select("id");
    expect(brands!.map((b) => b.id)).toContain(aliceBrandId);

    const { data: invoices } = await alice.client.from("invoices").select("id");
    expect(invoices!.map((i) => i.id)).toContain(aliceInvoiceId);
  });
});

describe("cross-tenant reads return nothing", () => {
  for (const table of [
    "orgs",
    "brands",
    "clients",
    "invoices",
    "invoice_items",
    "email_templates",
  ]) {
    it(`${table}: bob sees none of alice's rows`, async () => {
      const { data, error } = await bob.client.from(table).select("*");
      expect(error).toBeNull();
      // Bob's org is brand new and empty, and alice's rows must be invisible.
      expect(data).toEqual(table === "orgs" ? [expect.objectContaining({ id: bob.orgId })] : []);
    });
  }
});

describe("cross-tenant writes are rejected", () => {
  it("bob cannot insert into alice's org", async () => {
    const { error } = await bob.client.from("brands").insert({
      org_id: alice.orgId,
      name: "Hostile Brand",
      invoice_prefix: "HX",
      accent_color: "#000000",
    });
    expect(error).not.toBeNull();
  });

  it("bob cannot update alice's invoice", async () => {
    const { data, error } = await bob.client
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", aliceInvoiceId)
      .select();

    // No SELECT visibility means the update matches zero rows.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await admin
      .from("invoices")
      .select("status")
      .eq("id", aliceInvoiceId)
      .single();
    expect(unchanged!.status).toBe("draft");
  });

  it("bob cannot delete alice's invoice", async () => {
    await bob.client.from("invoices").delete().eq("id", aliceInvoiceId);

    const { data: stillThere } = await admin
      .from("invoices")
      .select("id")
      .eq("id", aliceInvoiceId)
      .single();
    expect(stillThere).not.toBeNull();
  });

  it("bob cannot reach alice's invoice_items through the parent", async () => {
    await admin.from("invoice_items").insert({
      invoice_id: aliceInvoiceId,
      position: 0,
      description: "Confidential line",
      amount: "5000.00",
      tax: "0",
    });

    const { data } = await bob.client
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", aliceInvoiceId);
    expect(data).toEqual([]);
  });
});

describe("a user cannot move their own row to another org", () => {
  it("rejects reassigning org_id on update", async () => {
    const { data, error } = await alice.client
      .from("brands")
      .update({ org_id: bob.orgId })
      .eq("id", aliceBrandId)
      .select();

    // WITH CHECK rejects the new row. Either an error, or zero rows changed.
    if (!error) expect(data).toEqual([]);

    const { data: brand } = await admin
      .from("brands")
      .select("org_id")
      .eq("id", aliceBrandId)
      .single();
    expect(brand!.org_id).toBe(alice.orgId);
  });
});

describe("the RLS helper is not a public endpoint", () => {
  it("cannot be called directly by an authenticated user", async () => {
    const { error } = await alice.client.rpc("is_org_member", { p_org_id: alice.orgId });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- rls`
Expected: FAIL — with RLS not yet enabled, Bob sees Alice's rows.

- [ ] **Step 3: Create the migration file**

```bash
supabase migration new rls_policies
```

- [ ] **Step 4: Write the helper function**

```sql
/**
 * True when the calling user belongs to the given org.
 *
 * `security definer` so the membership lookup is not itself subject to the
 * org_members policy (which would recurse). The identity check on
 * `auth.uid()` is INSIDE the body, so the function cannot be used to probe
 * an arbitrary org. `execute` is revoked from every client role below, so it
 * is not reachable as an RPC — RLS policy expressions evaluate with the
 * table owner's privileges and can still call it.
 *
 * `stable` lets the planner cache it within a statement.
 */
create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_org_member(uuid)
  from public, anon, authenticated, service_role;

-- Then grant it back to `authenticated` alone.
--
-- This is NOT redundant with the revoke above, and the revoke on its own is a
-- bug. RLS policy expressions are evaluated with the *querying* role's
-- privileges, not the table owner's. `security definer` governs what happens
-- INSIDE the function body once it is called; it does not waive the EXECUTE
-- check needed to call it. Without this grant every policy below fails closed
-- with `permission denied for function is_org_member` — verified directly
-- against this database:
--
--   set role authenticated;
--   select count(*) from public.brands;
--   -- ERROR:  permission denied for function is_org_member
--
-- Granting it to `authenticated` is safe on two independent grounds:
--   1. `private` is absent from config.toml's
--      `schemas = ["public", "graphql_public"]`, so PostgREST cannot route to
--      it at all — /rpc answers PGRST202 or PGRST106 whichever schema header
--      is sent.
--   2. Even if it were reachable, the function checks `auth.uid()` internally
--      and answers only "is the CALLING user a member of org X" — a question
--      the caller already knows the answer to. No other tenant's data is
--      exposed.
--
-- `anon`, `public` and `service_role` stay revoked. `service_role` bypasses
-- RLS entirely and never evaluates these policies.
grant execute on function private.is_org_member(uuid) to authenticated;
```

> **Correction to a widely-copied pattern.** Supabase's own RLS-performance guidance shows
> `revoke execute … from PUBLIC, anon, authenticated, service_role` followed by using the helper
> in a policy, on the stated basis that policy expressions evaluate with the owner's privileges.
> That basis is wrong, and following it verbatim yields policies that fail closed for every
> user. The revoke is still correct — it is the missing re-grant to `authenticated` that breaks
> it. Do not "simplify" this pair back to a lone revoke.

- [ ] **Step 5: Write the org and membership policies**

```sql
alter table public.orgs enable row level security;
alter table public.orgs force row level security;

create policy orgs_select on public.orgs
  for select to authenticated
  using ((select private.is_org_member(id)));

-- Orgs are created only by the signup trigger, which is security definer.
-- No insert/update/delete policy exists, so clients cannot do any of them.

alter table public.org_members enable row level security;
alter table public.org_members force row level security;

create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No write policies: memberships are managed by the signup trigger only.
-- Invites arrive with the workspaces feature, not before.
```

- [ ] **Step 6: Write the org-scoped table policies**

Repeat this exact block for each of `brands`, `clients`, `invoices`, `email_templates`, substituting the table name. The code is repeated rather than generated so each table's policy set is greppable.

```sql
alter table public.brands enable row level security;
alter table public.brands force row level security;

create policy brands_select on public.brands
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy brands_insert on public.brands
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy brands_update on public.brands
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy brands_delete on public.brands
  for delete to authenticated
  using ((select private.is_org_member(org_id)));
```

```sql
alter table public.clients enable row level security;
alter table public.clients force row level security;

create policy clients_select on public.clients
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy clients_insert on public.clients
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy clients_update on public.clients
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy clients_delete on public.clients
  for delete to authenticated
  using ((select private.is_org_member(org_id)));
```

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
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy invoices_delete on public.invoices
  for delete to authenticated
  using ((select private.is_org_member(org_id)));
```

```sql
alter table public.email_templates enable row level security;
alter table public.email_templates force row level security;

create policy email_templates_select on public.email_templates
  for select to authenticated
  using ((select private.is_org_member(org_id)));

create policy email_templates_insert on public.email_templates
  for insert to authenticated
  with check ((select private.is_org_member(org_id)));

create policy email_templates_update on public.email_templates
  for update to authenticated
  using ((select private.is_org_member(org_id)))
  with check ((select private.is_org_member(org_id)));

create policy email_templates_delete on public.email_templates
  for delete to authenticated
  using ((select private.is_org_member(org_id)));
```

- [ ] **Step 7: Write the invoice_items policies**

`invoice_items` has no `org_id`; it authorizes through its parent invoice.

```sql
alter table public.invoice_items enable row level security;
alter table public.invoice_items force row level security;

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

create policy invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));

create policy invoice_items_update on public.invoice_items
  for update to authenticated
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

create policy invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (select private.is_org_member(i.org_id))
  ));
```

- [ ] **Step 7b: Grant `authenticated` the access its policies describe**

A grant and a policy are two halves of one security decision: the grant says whether the role may address the table **at all**, RLS says which rows it then sees. Postgres checks grants *first*, so without this the tests in Step 1 fail with `permission denied` before any policy is ever consulted — and a cross-tenant test that passes for that reason proves nothing about isolation.

These grants mirror the policies above exactly: full CRUD where the table has insert/update/delete policies, select-only on `orgs` and `org_members`, which are written solely by the signup trigger.

```sql
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.brands,
  public.clients,
  public.invoices,
  public.invoice_items,
  public.email_templates
to authenticated;

grant select on public.orgs, public.org_members to authenticated;

-- `anon` is granted nothing at all, deliberately: every route that touches
-- data requires a session. Task 5 proves it with a test rather than trusting
-- the absence of a grant statement.
```

- [ ] **Step 8: Apply and re-run**

```bash
supabase db reset
npm run test:integration -- rls
```

Expected: PASS, every test.

- [ ] **Step 9: Re-run the earlier suites**

```bash
npm run test:integration
```

Expected: PASS. `schema.test.ts` uses the `admin` client, which bypasses RLS, so it is unaffected. If it now fails, the cause is a policy on a table the admin client should still reach — investigate rather than weakening a policy.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations src/test/integration/rls.test.ts
git commit -m "feat(db): RLS on every table with cross-tenant isolation tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Prove `anon` is locked out, and clear the advisors

> **Scope changed mid-execution (2026-08-11).** This task originally issued all the Data API grants. Those moved into Task 4, where they belong beside the policies they mirror — Task 4's own tests cannot run without them. What remains here is the half that was never really about grants: proving the anonymous role can reach nothing, and clearing the database advisors.

**Files:**
- Create: `src/test/integration/anon.test.ts`

**Interfaces:**
- Consumes: all tables, policies and `authenticated` grants from Tasks 2–4.
- Produces: no new application interfaces. A regression test pinning the anonymous access surface.

- [ ] **Step 1: Write the anon lockdown test**

This test pins the **outcome**: a signed-out visitor retrieves no rows and writes no rows, today and on every future run.

Be precise about what it does *not* prove. From an anon REST client's vantage point, "no grant exists" and "a grant exists but RLS denies every row" are **observationally identical** — both yield an empty result on select and an error on insert, under the same SQLSTATE. Since all 22 policies target `to authenticated`, Postgres falls through to implicit default-deny for `anon`, so adding `grant all on all tables in schema public to anon` tomorrow would **not** fail this test. No client-side test can distinguish those two states; that requires reading the catalogue, which anon cannot do.

That is acceptable, because the outcome is the security property and RLS enforces it independently of the grant layer. This test would still fail loudly on a real leak — a future `to anon` policy with `using (true)`, or `force row level security` being dropped. Step 1b adds the mechanism-level check separately.

`src/test/integration/anon.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

/** A signed-out visitor: the publishable key with no session attached. */
const anon = createClient(URL, PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  "orgs",
  "org_members",
  "brands",
  "clients",
  "invoices",
  "invoice_items",
  "email_templates",
] as const;

/**
 * One schema-valid row per table. These would satisfy every not-null and
 * check constraint if a permitted caller sent them, so a rejection is
 * attributable to permissions rather than to a malformed payload.
 * The uuids are deliberately random and reference nothing.
 */
const VALID_ROWS: Record<(typeof TABLES)[number], Record<string, unknown>> = {
  orgs: { name: "Anon Org" },
  org_members: {
    org_id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    role: "owner",
  },
  brands: {
    org_id: "00000000-0000-4000-8000-000000000001",
    name: "Anon Brand",
    invoice_prefix: "AN",
    accent_color: "#2563eb",
  },
  clients: {
    org_id: "00000000-0000-4000-8000-000000000001",
    company_name: "Anon Client",
  },
  invoices: {
    org_id: "00000000-0000-4000-8000-000000000001",
    brand_id: "00000000-0000-4000-8000-000000000003",
    invoice_number: "AN-2026-001",
    currency: "INR",
    bill_date: "2026-08-11",
    due_date: "2026-09-10",
    client_snapshot: {},
    brand_snapshot: {},
  },
  invoice_items: {
    invoice_id: "00000000-0000-4000-8000-000000000004",
    position: 0,
    description: "Anon line",
    amount: "1.00",
    tax: "0",
  },
  email_templates: {
    org_id: "00000000-0000-4000-8000-000000000001",
    name: "Anon template",
    subject: "Hello",
    tone: "Friendly",
    body: "Body",
  },
};

describe("an anonymous visitor can reach no data at all", () => {
  for (const table of TABLES) {
    it(`${table}: select returns no rows to anon`, async () => {
      const { data } = await anon.from(table).select("*").limit(1);
      // A hard permission error and an empty result are both acceptable.
      // What must never happen is a row coming back. `error` is deliberately
      // not asserted on: any assertion covering "error OR empty" is
      // vacuously true, and the row check alone already says what matters.
      expect(data ?? []).toEqual([]);
    });

    it(`${table}: insert is rejected for anon`, async () => {
      // A *valid* payload, so the rejection is attributable to permissions
      // rather than to a not-null violation. `insert({})` would be rejected
      // by every table's constraints even for a fully authorized caller,
      // which would prove nothing about anon.
      const { error } = await anon.from(table).insert(VALID_ROWS[table]);
      expect(error).not.toBeNull();
    });
  }
});
```

- [ ] **Step 1b: Pin the grant layer itself**

Step 1 pins the outcome. This pins the mechanism, closing the blind spot named above: it reads the catalogue directly, so it *can* tell "no grant" from "grant plus default-deny".

Why bother, when a stray `anon` grant leaks nothing on its own? Because it stops being harmless the moment any future policy targets `anon` — a public "pay this invoice" link is a plausible Phase 2 feature. A grant added today and a `to anon` policy added next quarter are individually defensible and jointly a leak. This test catches the drift while it is still inert.

The catalogue is not reachable through PostgREST, so this connects to Postgres directly.

```bash
npm install --save-dev --save-exact pg @types/pg
```

Add the connection string to `.env.test.local` (gitignored) — take the value from `supabase status -o env`'s `DB_URL`:

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
```

Add the same key with a placeholder to the committed `.env.local.example`.

`src/test/integration/anon-grants.test.ts`:

```ts
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  throw new Error(
    "anon-grants.test.ts needs SUPABASE_DB_URL in .env.test.local. " +
      "Take it from `supabase status -o env`'s DB_URL."
  );
}

const APP_TABLES = [
  "orgs",
  "org_members",
  "brands",
  "clients",
  "invoices",
  "invoice_items",
  "email_templates",
];

const db = new Client({ connectionString: DB_URL });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe("the anon role holds no privilege on any application table", () => {
  it("has no data privileges granted", async () => {
    const { rows } = await db.query(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'anon'
          and table_schema = 'public'
          and table_name = any($1)
          and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
        order by table_name, privilege_type`,
      [APP_TABLES]
    );

    // Postgres also records inert defaults (REFERENCES/TRIGGER/TRUNCATE/
    // MAINTAIN) for anon. Those cannot read or write data, so the filter
    // above deliberately ignores them — only the four data privileges matter.
    expect(rows).toEqual([]);
  });

  it("has no column-level privileges granted", async () => {
    // A column grant would not appear in role_table_grants, so a table-level
    // check alone could be satisfied while `anon` still reads one column.
    const { rows } = await db.query(
      `select table_name, column_name, privilege_type
         from information_schema.column_privileges
        where grantee = 'anon'
          and table_schema = 'public'
          and table_name = any($1)
          and privilege_type in ('SELECT','INSERT','UPDATE')
        order by table_name, column_name`,
      [APP_TABLES]
    );
    expect(rows).toEqual([]);
  });

  it("has no policy targeting it", async () => {
    // The grant only becomes a leak when paired with a policy that admits
    // anon. Catch that half too.
    const { rows } = await db.query(
      `select tablename, policyname, roles
         from pg_policies
        where schemaname = 'public'
          and 'anon' = any(roles)`
    );
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run both tests**

Run: `npm run test:integration -- anon`
Expected: PASS — 14 tests from `anon.test.ts`, 3 from `anon-grants.test.ts`.

If any table returns a row to `anon`, that is a live data leak — stop and report it rather than adjusting the test. If `anon-grants.test.ts` fails, a grant or policy has been added that should not exist; report it rather than deleting the assertion.

- [ ] **Step 3: Run the advisors**

```bash
supabase db advisors --local
```

Expected: zero security findings. If the CLI is still too old, use the Supabase MCP `get_advisors` tool instead.

Fix anything reported. Common findings and their correct fixes:

| Finding | Fix |
|---|---|
| `rls_disabled_in_public` | enable and force RLS on the named table |
| `function_search_path_mutable` | add `set search_path = ''` to the function |
| `security_definer_view` | add `with (security_invoker = true)` to the view |

Never resolve a finding by adding `security definer` or by dropping a policy.

- [ ] **Step 4: Confirm the whole integration suite still passes**

```bash
npm run test:integration
```

Expected: PASS, including Task 4's isolation tests and the new anon tests.

- [ ] **Step 5: Commit**

```bash
git add src/test/integration/anon.test.ts supabase/migrations
git commit -m "test(db): pin the anonymous access surface, clear advisors

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

> Include `supabase/migrations` in the `git add` only if clearing an advisor finding required a migration. If the advisors came back clean, this commit is the test alone.

---

## Task 6: The proxy — session refresh and route guarding

**Files:**
- Create: `src/lib/supabase/proxy.ts`, `src/proxy.ts` (**inside `src/`, not the repo root** — a root-level file is silently never detected under a `src/app` layout)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>` from `@/lib/supabase/proxy`.

- [ ] **Step 1: Write the session-refresh helper**

`src/lib/supabase/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/", "/pricing", "/privacy", "/terms", "/login", "/callback"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * Refreshes the auth cookies on every request and redirects anonymous
 * visitors away from app routes.
 *
 * Two rules this function exists to honour:
 *
 * 1. Nothing may run between `createServerClient` and the claims check. An
 *    await in between can let a stale token through.
 * 2. The returned response MUST be the one the cookie handler mutated. Build
 *    a fresh `NextResponse` and you drop the refreshed cookies, which logs
 *    the user out at random once the old token expires.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getClaims() verifies the JWT locally against the JWKS endpoint rather
  // than calling the auth server on every request. Never getSession() here.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  if (!claims && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (claims && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 2: Write the root proxy**

`src/proxy.ts` — **not** `middleware.ts` (Next.js 16 deprecated that name), and **not** the repo root. This project has a `src/app` layout, and Next.js looks for the proxy at `appDir/..`, i.e. `src/`. A root-level `proxy.ts` is never detected and fails silently: the build shows no `ƒ Proxy (Middleware)` line and every guarded route returns 200 to anonymous visitors.

This file exports `proxy` and runs on the Node.js runtime.

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth cookies must be
     * refreshed on real navigations, not on every icon fetch.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2?)$).*)",
  ],
};
```

- [ ] **Step 3: Confirm JWT signing keys**

`getClaims()` only avoids a network round trip when the project signs JWTs with an asymmetric
algorithm (ES256/RS256) it can verify against the JWKS endpoint. With the legacy HS256 secret
it still returns correct claims, but falls back to calling the auth server — losing the whole
reason to prefer it over `getUser()`.

```bash
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json
```

Expected: a JWKS document containing at least one key with `"alg": "ES256"`. If it comes back
empty or the stack is on a symmetric secret, enable signing keys for the local project (and,
later, on the hosted project under **Auth → Signing Keys**) before relying on `getClaims()`.

- [ ] **Step 4: Verify the app still compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: success, **no deprecation warning about `middleware.ts`** (if one appears, the old file still exists — delete it), **and a `ƒ Proxy (Middleware)` line in the route output**.

That last one is not cosmetic: its absence is the only build-time signal that the proxy file is in the wrong place and the auth guard is inert. Do not proceed past this step without it.

- [ ] **Step 5: Verify the redirect by hand**

```bash
npm run dev
```

Visit `http://localhost:3000/brands` signed out.
Expected: redirected to `/login?next=/brands`. The login page does not exist yet, so a 404 at `/login` is the correct result for this step — the redirect itself is what is being verified.

- [ ] **Step 6: Confirm the unit suite still passes**

Run: `npm test`
Expected: 455 passed.

- [ ] **Step 7: Commit**

```bash
git add src/proxy.ts src/lib/supabase/proxy.ts
git commit -m "feat(auth): proxy.ts session refresh and route guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Route groups and the move to /dashboard

Pure restructuring. No behaviour changes beyond the URL.

**Files:**
- Move: `src/app/page.tsx` → `src/app/(app)/dashboard/page.tsx`
- Move: `src/app/{brands,clients,invoices,reports,followups}` → `src/app/(app)/...`
- Create: `src/app/(app)/layout.tsx`, `src/app/(marketing)/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`, `src/components/layout/site-header.tsx`, `src/components/layout/site-header.test.ts`, `src/components/invoices/invoice-form.tsx`, and four route files listed below

**Interfaces:**
- Consumes: `createServerSupabase()` from Task 1.
- Produces: the `/dashboard` route; `(app)` and `(marketing)` route groups.

- [ ] **Step 1: Update the failing test first**

`src/components/layout/site-header.test.ts` needs exactly two lines changed. Nothing else in the file moves.

Line 6, the first row of `CRUMB_CASES`:

```ts
  ["/dashboard", "Dashboard"],
```

Line 46, inside `describe("showNewInvoiceAction")`:

```ts
  it("shows the action on the dashboard", () => {
    expect(showNewInvoiceAction("/dashboard")).toBe(true);
  });
```

> The comment at the top of this file says the cases are transcribed from the design handoff's breadcrumb table. `docs/POST-MERGE-NOTES.md` flags that changing a row here means the handoff row is now stale. That is accepted: the dashboard genuinely moved, so the handoff is what is out of date.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- site-header`
Expected: FAIL — `getCrumb("/dashboard")` returns `"Invoicer"` (the unmapped fallback).

- [ ] **Step 3: Move the route files with git**

```bash
mkdir -p "src/app/(app)/dashboard"
git mv src/app/page.tsx "src/app/(app)/dashboard/page.tsx"
for d in brands clients invoices reports followups; do
  git mv "src/app/$d" "src/app/(app)/$d"
done
```

Test files colocated under those directories move with them — that is intended.

- [ ] **Step 4: Add the app-group layout**

`src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Defence in depth behind proxy.ts. The proxy already redirects anonymous
 * visitors, but a proxy matcher is a pattern and patterns can be wrong;
 * this check is the one that runs in the same place the data does.
 *
 * getUser() rather than getClaims() because this gate should notice a
 * deleted or banned user immediately, and it runs once per navigation
 * rather than on every asset request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) redirect("/login");

  return <>{children}</>;
}
```

- [ ] **Step 5: Add a placeholder marketing page**

`src/app/(marketing)/page.tsx` — the real landing page is a later plan. This exists so `/` resolves.

```tsx
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">Invoicer</h1>
      <p className="text-sm text-muted-foreground">
        Invoices, clients and brands — without the spreadsheet.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Sign in
      </Link>
    </main>
  );
}
```

- [ ] **Step 6: Update the crumb map**

In `src/components/layout/site-header.tsx`, change line 16 and line 33:

```ts
  if (pathname === "/dashboard") return "Dashboard";
```

```ts
export function showNewInvoiceAction(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    (INVOICE_DETAIL_RE.test(pathname) && pathname !== "/invoices/create")
  );
}
```

- [ ] **Step 7: Update the sidebar**

In `src/components/layout/app-sidebar.tsx`, line 31:

```ts
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
```

And `isNavItemActive` (lines 44–54):

```ts
function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    if (pathname === "/dashboard") return true;
    // Dashboard is also active on an invoice's detail page, e.g. /invoices/abc123
    // (but not /invoices/create or /invoices/abc123/edit).
    return /^\/invoices\/[^/]+$/.test(pathname) && pathname !== "/invoices/create";
  }

  const base = href === "/invoices/create" ? "/invoices" : href;
  return pathname.startsWith(base);
}
```

- [ ] **Step 8: Update every remaining navigation to `/`**

Six call sites, exact:

| File | Change |
|---|---|
| `src/app/(app)/invoices/[id]/page.tsx:186` | `router.push("/")` → `router.push("/dashboard")` |
| `src/app/(app)/invoices/[id]/page.tsx:196` | `href="/"` → `href="/dashboard"` |
| `src/app/(app)/brands/page.tsx:57` | `router.push("/")` → `router.push("/dashboard")` |
| `src/components/invoices/invoice-form.tsx:309` | `router.push("/")` → `router.push("/dashboard")` |
| `src/components/invoices/invoice-form.tsx:318` | `href="/"` → `href="/dashboard"` |
| `src/app/(app)/followups/page.tsx:31`, `templates/[id]/page.tsx:17`, `templates/create/page.tsx:14` | `router.replace("/")` → `router.replace("/dashboard")` |

Verify none remain:

```bash
grep -rn --include='*.tsx' -e 'href="/"' -e 'push("/")' -e 'replace("/")' src
```

Expected: no matches.

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: 455 passed, including the updated `site-header` cases.

- [ ] **Step 10: Verify the build and the routes**

Run: `npm run build`
Expected: success. The route list shows `/dashboard`, and `/` is now the marketing page.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(routes): (app) and (marketing) groups; dashboard moves to /dashboard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Login page and auth callback

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/callback/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client`; `createServerSupabase()` from `@/lib/supabase/server`.
- Produces: routes `/login` and `/callback`.

- [ ] **Step 1: Write the callback route**

`src/app/(auth)/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Both magic link and OAuth land here with a `code` to exchange for a
 * session. `next` carries the path the user originally asked for, so a
 * deep link survives the round trip through the auth provider.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Only ever redirect within this origin — an attacker-controlled `next`
  // would otherwise turn this into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
```

- [ ] **Step 2: Write the login page**

`src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const callbackUrl = () =>
    `${window.location.origin}/callback?next=${encodeURIComponent(next)}`;

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setPending(false);

    if (error) {
      toast(error.message);
      return;
    }
    setSent(true);
  }

  async function handleGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) toast(error.message);
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        Check your inbox — we sent a sign-in link to{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" disabled={pending || email.length === 0}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" onClick={handleGoogle}>
        Continue with Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Sign in to Invoicer</CardTitle>
        </CardHeader>
        <CardContent>
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify types and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Verify the magic-link flow by hand**

```bash
npm run dev
```

1. Visit `http://localhost:3000/brands` signed out → redirected to `/login?next=/brands`.
2. Enter any email, submit → "Check your inbox".
3. Open Inbucket, the local mail catcher, at `http://127.0.0.1:54324` and click the link.
4. Expected: landed on `/brands`, signed in.
5. Visit `/login` while signed in → redirected to `/dashboard`.

> Google OAuth needs real credentials in `supabase/config.toml` and cannot be exercised against the local stack without them. Verify magic link now; verify Google against a real Supabase project when one exists.

- [ ] **Step 5: Confirm the unit suite still passes**

Run: `npm test`
Expected: 455 passed.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)"
git commit -m "feat(auth): magic-link and Google sign-in with auth callback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Real user in the sidebar, and sign-out

**Files:**
- Create: `src/components/layout/user-menu.tsx`, `src/components/layout/user-menu.test.tsx`
- Modify: `src/components/layout/app-sidebar.tsx:41-42, 100-108`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client`.
- Produces: `<UserMenu />`; `initialFor(email: string | undefined): string` exported for testing.

- [ ] **Step 1: Write the failing test**

`src/components/layout/user-menu.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { initialFor } from "./user-menu";

describe("initialFor", () => {
  it("uses the first letter of the email, uppercased", () => {
    expect(initialFor("hello@sivansundar.com")).toBe("H");
  });

  it("falls back to a neutral glyph when the email is missing", () => {
    expect(initialFor(undefined)).toBe("?");
  });

  it("ignores leading whitespace", () => {
    expect(initialFor("  ada@example.com")).toBe("A");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- user-menu`
Expected: FAIL — cannot resolve `./user-menu`.

- [ ] **Step 3: Write the component**

`src/components/layout/user-menu.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function initialFor(email: string | undefined): string {
  const trimmed = email?.trim() ?? "";
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}

export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? undefined);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast(error.message);
      return;
    }
    // refresh() so the proxy re-evaluates and clears any cached server render.
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 p-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-accent text-xs font-medium">
        {initialFor(email)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {email ?? "Signed in"}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Sign out"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- user-menu`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into the sidebar**

In `src/components/layout/app-sidebar.tsx`:

Delete lines 41–42 (the `LOCAL_USER` constant and its comment):

```ts
// The current user is a static local record — there is no auth in this build.
const LOCAL_USER = { name: "Sivan", email: "hello@sivansundar.com" };
```

Add the import alongside the other layout imports:

```ts
import { UserMenu } from "./user-menu";
```

Replace the static footer block (lines 100–108) with:

```tsx
        <UserMenu />
```

- [ ] **Step 6: Confirm nothing else referenced the constant**

```bash
grep -rn "LOCAL_USER" src
```

Expected: no matches.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: 458 passed (455 + the 3 new `user-menu` tests).

- [ ] **Step 8: Verify sign-out by hand**

```bash
npm run dev
```

1. Sign in via magic link.
2. The sidebar footer shows your real email, not `hello@sivansundar.com`.
3. Click the sign-out icon → redirected to `/login`.
4. Visit `/dashboard` → redirected back to `/login`.

- [ ] **Step 9: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:integration
npm run build
```

Expected: types clean, zero lint problems, 458 unit tests passing, integration suite passing, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout
git commit -m "feat(auth): show the signed-in user and add sign-out

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done when

- [ ] `supabase db reset` replays all five migrations cleanly
- [ ] `supabase db advisors --local` reports zero security findings
- [ ] Integration suite proves cross-tenant isolation on all seven tables
- [ ] Anonymous visitors cannot reach any `(app)` route
- [ ] Magic-link sign-in works end to end against the local stack
- [ ] The sidebar shows the real signed-in user and sign-out works
- [ ] 458 unit tests passing, clean build, zero lint problems

## Explicitly NOT in this plan

Deferred to the Phase 2 plan (spec §16 phases 3–5), and must not be started here:

- Moving any app data off `localStorage` — the app still reads and writes it
- `src/lib/storage.ts` becoming async, TanStack Query, loading skeletons
- The brand-logo Storage bucket
- The `create_invoice` numbering RPC
- The `localStorage` → Postgres importer

Also deferred, because no hosted Supabase project exists yet — this plan targets the local
stack only:

- Creating the hosted Supabase project and pushing migrations to it
- Resend as the custom SMTP provider (spec §13). Supabase's built-in sender is rate-limited
  and not usable for production magic links, but the local stack catches mail in Inbucket, so
  nothing here needs it
- Google OAuth credentials

Deferred to the Phase 3 plan: the real landing page, SEO, `metadataBase`, PostHog, Sentry, and
the §15 launch gates.
