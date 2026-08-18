#!/usr/bin/env node
/**
 * Brings the local stack up and writes the `.env.local` the app needs.
 *
 * Without this, the first thing a new checkout does is throw
 * `NEXT_PUBLIC_SUPABASE_URL is not set` — from a click on the sign-in
 * button, several steps after the point where the setup was actually
 * missed. `.env.local.example` told you to copy it and paste values from
 * `supabase status`, which is three manual steps and one of them
 * (`ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) renames the key.
 *
 * Everything here is derived from `supabase status -o env` rather than
 * hardcoded, so it keeps working if the ports in `supabase/config.toml`
 * change — this repo already runs the API on 54421 rather than the CLI
 * default of 54321.
 *
 * Safe to re-run: an already-running stack is detected and left alone, and
 * any keys in an existing `.env.local` that this script does not own are
 * preserved.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");

/** Keys this script owns, and where each comes from in `status -o env`. */
const MANAGED = {
  NEXT_PUBLIC_SUPABASE_URL: ["API_URL"],
  // The CLI renamed the anon key to the publishable key in 2.x and still
  // emits both on some versions; take whichever is present.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["PUBLISHABLE_KEY", "ANON_KEY"],
};

function run(args, { quiet = false } = {}) {
  return execFileSync("npx", ["--yes", "supabase", ...args], {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
    maxBuffer: 1 << 24,
  });
}

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`\n  ${hint}\n`);
  process.exit(1);
}

/** `supabase status -o env` prints KEY="value" lines. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

/**
 * Rewrites the managed keys while preserving anything else already in the
 * file — NEXT_PUBLIC_SITE_URL, or whatever has been added since. Comments
 * this script wrote are dropped so re-running does not stack them up.
 */
export function renderEnvFile(managed, existing) {
  const kept = existing
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("# Written by `npm run dev:setup`")) return false;
      if (trimmed.startsWith("# the anon key is regenerated")) return false;
      const name = /^([A-Z0-9_]+)=/.exec(trimmed)?.[1];
      return name ? !(name in managed) : true;
    })
    .join("\n")
    .trim();

  const body = [
    "# Written by `npm run dev:setup`. Re-run it after `supabase stop`/`start`;",
    "# the anon key is regenerated when the stack is recreated.",
    ...Object.entries(managed).map(([name, value]) => `${name}=${value}`),
    kept ? `\n${kept}` : "",
  ]
    .join("\n")
    .trimEnd();

  return `${body}\n`;
}

function readExisting() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function dockerIsRunning() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function statusEnv() {
  try {
    // Not `quiet: false` — a stopped stack writes a long explanation to
    // stderr that would look like a crash before we have decided anything.
    return parseEnv(run(["status", "-o", "env"], { quiet: true }));
  } catch {
    return null;
  }
}

function main() {
console.log("Setting up the local stack…\n");

if (!dockerIsRunning()) {
  fail(
    "Docker is not running.",
    "Supabase's local stack is a set of containers. Start Docker Desktop (or\n  your daemon of choice) and run this again."
  );
}

let env = statusEnv();

if (env?.API_URL) {
  console.log("• Supabase is already running.");
} else {
  console.log("• Starting Supabase (first run pulls images — this can take a few minutes)…\n");
  try {
    run(["start"]);
  } catch {
    fail(
      "`supabase start` failed.",
      "The output above has the reason. If it is an image pull, check your\n  network; if a port is taken, `npm run db:stop` then try again."
    );
  }
  env = statusEnv();
  if (!env?.API_URL) {
    fail("Supabase started but `supabase status` reported no API URL.");
  }
}

const resolved = {};
for (const [target, sources] of Object.entries(MANAGED)) {
  const key = sources.find((source) => env[source]);
  if (!key) {
    fail(
      `\`supabase status\` did not report ${sources.join(" or ")}.`,
      "This usually means the stack is only partly up. Try `npm run db:stop`\n  followed by this script again."
    );
  }
  resolved[target] = env[key];
}

writeFileSync(ENV_PATH, renderEnvFile(resolved, readExisting()));

console.log(`• Wrote .env.local (${Object.keys(resolved).join(", ")})`);

// The magic-link flow is unusable locally until you know where the mail
// lands, and that is the one URL the app itself never shows you.
const inbox = env.MAILPIT_URL || env.INBUCKET_URL;
console.log("\nReady. Next:\n");
console.log("  npm run dev        →  http://localhost:3000");
if (inbox) {
  console.log(`  sign-in emails     →  ${inbox}`);
} else {
  console.log("  sign-in emails     →  run `npx supabase status` for the Mailpit URL");
}
console.log("\nMagic links are not delivered to a real inbox locally — they land in");
console.log("the mail viewer above. Google sign-in needs real OAuth credentials and");
console.log("will not work against the local stack.\n");
}

// Importing this file (the tests do) must not start containers.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
