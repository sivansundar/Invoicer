import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  throw new Error(
    "grants.test.ts needs SUPABASE_DB_URL in .env.test.local. " +
      "Take it from `supabase status -o env`'s DB_URL."
  );
}

/**
 * The exposure surface of every client-reachable role.
 *
 * `anon-grants.test.ts` pins `anon` specifically — it should hold nothing at
 * all. This file covers the harder question: `authenticated` is *supposed*
 * to hold privileges, so the check cannot be "holds nothing". It is whether
 * every privilege it holds is one that RLS actually gates.
 *
 * Recorded as a carry-over from Phase 1, which spotted that the `anon`-only
 * check would pass while `authenticated` regained TRUNCATE.
 */

const APP_TABLES = [
  "orgs",
  "org_members",
  "brands",
  "clients",
  "invoices",
  "invoice_items",
  "email_templates",
];

/**
 * The four privileges RLS has a policy concept for. Anything else granted on
 * a table — TRUNCATE especially — is ungated by definition: no policy can
 * restrict it, so holding it is unconditional.
 */
const POLICY_GATED = ["SELECT", "INSERT", "UPDATE", "DELETE"];

const db = new Client({ connectionString: DB_URL });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe("no client role holds a privilege RLS cannot gate", () => {
  it.each(["anon", "authenticated"])("%s holds no TRUNCATE on any app table", async (role) => {
    // The specific regression Phase 1 flagged. RLS has no policy for
    // TRUNCATE, so a grant is unconditional data destruction — and the
    // original check queried `anon` only, so an `authenticated` regression
    // would have passed the suite.
    const { rows } = await db.query(
      `select table_name
         from information_schema.role_table_grants
        where grantee = $1
          and table_schema = 'public'
          and table_name = any($2)
          and privilege_type = 'TRUNCATE'
        order by table_name`,
      [role, APP_TABLES]
    );

    expect(rows).toEqual([]);
  });
});

describe("grants mirror policies", () => {
  /**
   * The assertion Phase 1 asked for, and the reason it is worth more than
   * either TRUNCATE check above: it does not name a privilege.
   *
   * A role holding SELECT on a table with no SELECT policy is not
   * necessarily a leak — RLS fails closed, so it reads nothing. It is a
   * discrepancy, and discrepancies are how leaks start: the grant is
   * already there, so adding the policy later is a one-line change nobody
   * reviews as an exposure decision. Keeping the two in step means every
   * widening shows up as a policy diff.
   *
   * This keeps working as tables are added, which the hand-listed checks do
   * not.
   */
  it("every privilege a client role holds has a matching policy", async () => {
    const { rows } = await db.query(
      `with grants as (
         select g.grantee as role, g.table_name, g.privilege_type
           from information_schema.role_table_grants g
          where g.grantee in ('anon', 'authenticated')
            and g.table_schema = 'public'
            and g.table_name = any($1)
            and g.privilege_type = any($2)
       )
       select grants.role, grants.table_name, grants.privilege_type
         from grants
        where not exists (
          select 1
            from pg_policies p
           where p.schemaname = 'public'
             and p.tablename = grants.table_name
             and grants.role = any(p.roles)
             and (
               p.cmd = 'ALL'
               or p.cmd = grants.privilege_type
             )
        )
        order by grants.role, grants.table_name, grants.privilege_type`,
      [APP_TABLES, POLICY_GATED]
    );

    expect(rows).toEqual([]);
  });

  it("finds a discrepancy when one is introduced", async () => {
    // Proves the query above is not vacuous. Without this, a join that
    // silently matched everything would report a clean database forever.
    await db.query("grant delete on public.orgs to authenticated");

    try {
      const { rows } = await db.query(
        `select 1
           from information_schema.role_table_grants g
          where g.grantee = 'authenticated'
            and g.table_schema = 'public'
            and g.table_name = 'orgs'
            and g.privilege_type = 'DELETE'
            and not exists (
              select 1
                from pg_policies p
               where p.schemaname = 'public'
                 and p.tablename = 'orgs'
                 and 'authenticated' = any(p.roles)
                 and (p.cmd = 'ALL' or p.cmd = 'DELETE')
            )`
      );

      // `orgs` has no DELETE policy, so the grant just made is exactly the
      // kind of discrepancy the assertion above exists to catch.
      expect(rows).toHaveLength(1);
    } finally {
      await db.query("revoke delete on public.orgs from authenticated");
    }
  });

  it("leaves the database as it found it", async () => {
    // The test above grants and revokes. If its `finally` ever fails to run,
    // every later run of the previous test would fail confusingly rather
    // than pointing here.
    const { rows } = await db.query(
      `select 1
         from information_schema.role_table_grants
        where grantee = 'authenticated'
          and table_schema = 'public'
          and table_name = 'orgs'
          and privilege_type = 'DELETE'`
    );

    expect(rows).toEqual([]);
  });
});
