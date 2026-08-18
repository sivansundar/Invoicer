#!/usr/bin/env node
/**
 * Fails when `supabase/config.toml` still carries the local-only auth
 * settings and something is about to push it at a hosted project.
 *
 * `enable_signup = true` with `enable_confirmations = false` is correct for
 * the local stack — it is what lets integration tests sign in with a
 * password. The CLI pushes this file verbatim, so on a hosted project the
 * same two lines let anyone self-register an arbitrary address,
 * pre-confirmed, against a product whose stated auth surface is magic link
 * and Google.
 *
 * Section-aware on purpose: `enable_signup` and `enable_confirmations` both
 * also appear under `[auth.sms]`, for a provider this project has disabled
 * (`[auth.sms]`'s own `enabled = false`) and that has nothing to do with the
 * risk this script exists to catch. A file-wide regex would block on that
 * unrelated line too, and its message would name a setting the deployer had
 * already fixed — a gate that blocks for a reason its own message doesn't
 * explain gets disabled, not respected. Only `[auth]` and `[auth.email]` are
 * evaluated; only a line scan is used, not a TOML parser, since the file's
 * shape is small and stable enough that section-header tracking covers it.
 *
 * Opt in with DEPLOY_TARGET=hosted. Local runs are unaffected, which is the
 * point: the local settings are not a mistake, deploying them is.
 */
import { readFileSync } from "node:fs";

if (process.env.DEPLOY_TARGET !== "hosted") {
  console.log("check-deploy-config: DEPLOY_TARGET is not 'hosted' — skipping.");
  process.exit(0);
}

const CONFIG_PATH = "supabase/config.toml";
const RELEVANT_SECTIONS = new Set(["auth", "auth.email"]);
const SECTION_HEADER = /^\[([\w.]+)\]\s*$/;
const ENABLE_SIGNUP = /^\s*enable_signup\s*=\s*true/;
const ENABLE_CONFIRMATIONS = /^\s*enable_confirmations\s*=\s*false/;

const lines = readFileSync(CONFIG_PATH, "utf8").split("\n");
const problems = [];
let currentSection = null;

lines.forEach((line, index) => {
  const lineNumber = index + 1;

  // Section headers only count when they start the line — a commented-out
  // one (`# [auth.passkey]`) is not a real section and must not reset
  // `currentSection` away from the one actually in force.
  const headerMatch = SECTION_HEADER.exec(line);
  if (headerMatch) {
    currentSection = headerMatch[1];
    return;
  }

  if (!RELEVANT_SECTIONS.has(currentSection)) return;

  if (ENABLE_SIGNUP.test(line)) {
    problems.push(
      `enable_signup = true at [${currentSection}] line ${lineNumber} — anyone could self-register on a hosted project.`
    );
  }
  if (ENABLE_CONFIRMATIONS.test(line)) {
    problems.push(
      `enable_confirmations = false at [${currentSection}] line ${lineNumber} — registrations would be pre-confirmed.`
    );
  }
});

if (problems.length > 0) {
  console.error(`${CONFIG_PATH} is not safe to push to a hosted project:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee docs/DEPLOY-CHECKLIST.md.");
  process.exit(1);
}

console.log("check-deploy-config: config.toml is safe for a hosted target.");
