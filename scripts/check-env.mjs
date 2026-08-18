#!/usr/bin/env node
/**
 * Refuses to start the dev server when the Supabase environment is missing.
 *
 * Wired as npm's `predev`, so it runs once before `next dev` and fails there
 * rather than in the browser. Without it the first symptom is
 * `NEXT_PUBLIC_SUPABASE_URL is not set` thrown from a click on the sign-in
 * button — a runtime overlay several steps after the setup was actually
 * skipped, which reads like a bug in the page rather than a missing file.
 *
 * A `predev` hook rather than a check inside `next.config.ts`: Next loads its
 * config in both the CLI process and the server process it spawns, so the
 * same message printed from there appears twice.
 *
 * Only `npm run dev` is gated. `NEXT_PUBLIC_*` values are inlined at build
 * time so a build without them is also broken, but build environments belong
 * to CI and Vercel, and failing their builds from here would block deploys
 * for a reason this script has no business deciding.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Exactly what `src/lib/supabase/env.ts` reads. */
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

const ENV_PATH = resolve(process.cwd(), ".env.local");

/**
 * Reads `.env.local` directly. `predev` runs before Next boots, so nothing has
 * loaded it into `process.env` yet — but the real env still wins, since that is
 * how someone running with exported variables expects it to behave.
 *
 * Values are taken verbatim apart from surrounding quotes: a value that is
 * empty, or still the literal `replace-me` from the example file, is a
 * misconfiguration this is here to catch.
 */
export function readEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Returns the names that are absent, blank, or still a placeholder. */
export function findProblems(required, fileEnv, processEnv) {
  return required.filter((name) => {
    const value = processEnv[name] ?? fileEnv[name];
    return !value || value === "replace-me";
  });
}

export function buildMessage(missing, hasFile) {
  return [
    "",
    `  Cannot start: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`,
    "",
    hasFile
      ? "  .env.local exists but does not have usable values for those names."
      : "  There is no .env.local in the repo root.",
    "",
    "  Fix it with:",
    "",
    "      npm run dev:setup",
    "",
    "  That starts the local Supabase stack (Docker must be running) and writes",
    "  .env.local for you. Three things that look right but are not:",
    "",
    "    · .env.local must sit in the repo root, beside package.json.",
    "    · The app reads the NEXT_PUBLIC_-prefixed names. The unprefixed",
    "      SUPABASE_* block in .env.local.example belongs to the integration",
    "      suite and does not feed the app.",
    "    · `supabase status` calls it ANON_KEY; the app wants that value under",
    "      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    "",
  ].join("\n");
}

function main() {
  const hasFile = existsSync(ENV_PATH);
  const fileEnv = hasFile ? readEnvFile(readFileSync(ENV_PATH, "utf8")) : {};
  const missing = findProblems(REQUIRED, fileEnv, process.env);

  if (missing.length > 0) {
    console.error(buildMessage(missing, hasFile));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
