import { describe, expect, it } from "vitest";
import { parseEnv, renderEnvFile } from "./dev-setup.mjs";

// A trimmed but otherwise verbatim `supabase status -o env`.
const STATUS = `
API_URL="http://127.0.0.1:54421"
GRAPHQL_URL="http://127.0.0.1:54421/graphql/v1"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54422/postgres"
STUDIO_URL="http://127.0.0.1:54423"
MAILPIT_URL="http://127.0.0.1:54424"
ANON_KEY="eyJhbGciOiJIUzI1NiIs.anon"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIs.service"
`;

describe("parseEnv", () => {
  it("reads the KEY=\"value\" lines the CLI prints", () => {
    const env = parseEnv(STATUS);
    expect(env.API_URL).toBe("http://127.0.0.1:54421");
    expect(env.ANON_KEY).toBe("eyJhbGciOiJIUzI1NiIs.anon");
    expect(env.MAILPIT_URL).toBe("http://127.0.0.1:54424");
  });

  it("does not choke on blank lines or unquoted values", () => {
    expect(parseEnv('\n\nAPI_URL=http://x\n\n')).toEqual({ API_URL: "http://x" });
  });

  it("ignores anything that is not a KEY=value line", () => {
    expect(parseEnv("supabase local development setup is running.\nAPI_URL=\"http://x\"")).toEqual({
      API_URL: "http://x",
    });
  });
});

describe("renderEnvFile", () => {
  const managed = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
  };

  it("writes the managed keys", () => {
    const out = renderEnvFile(managed, "");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=anon-key");
    expect(out.endsWith("\n")).toBe(true);
  });

  // Someone's NEXT_PUBLIC_SITE_URL must survive a re-run.
  it("preserves keys it does not own", () => {
    const out = renderEnvFile(managed, "NEXT_PUBLIC_SITE_URL=http://localhost:3000\n");
    expect(out).toContain("NEXT_PUBLIC_SITE_URL=http://localhost:3000");
  });

  it("replaces a stale value rather than appending a duplicate", () => {
    const out = renderEnvFile(managed, "NEXT_PUBLIC_SUPABASE_URL=http://old:1234\n");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421");
    expect(out).not.toContain("http://old:1234");
    expect(out.match(/NEXT_PUBLIC_SUPABASE_URL=/g)).toHaveLength(1);
  });

  it("does not stack its own header on repeated runs", () => {
    const once = renderEnvFile(managed, "");
    const twice = renderEnvFile(managed, once);
    expect(twice.match(/# Written by/g)).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("keeps a user's own comments", () => {
    const out = renderEnvFile(managed, "# my note\nNEXT_PUBLIC_SITE_URL=http://x\n");
    expect(out).toContain("# my note");
  });
});
