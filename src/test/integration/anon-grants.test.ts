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
          and privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
        order by table_name, privilege_type`,
      [APP_TABLES]
    );

    // TRUNCATE is included above deliberately: unlike SELECT/INSERT/UPDATE/
    // DELETE, RLS has no policy concept for it, so a grant here is not a
    // "the policy still gates it" situation — it is unconditional data
    // destruction. `*_revoke_destructive_grants.sql` revokes it (along with
    // REFERENCES/TRIGGER, which stay out of this list because they cannot
    // read or write data, only attach an FK or a trigger). If that
    // migration's revoke ever regresses, this assertion is the one that
    // catches it.
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
