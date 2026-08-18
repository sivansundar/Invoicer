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
 * Opt in with DEPLOY_TARGET=hosted. Local runs are unaffected, which is the
 * point: the local settings are not a mistake, deploying them is.
 */
import { readFileSync } from "node:fs";

if (process.env.DEPLOY_TARGET !== "hosted") {
  console.log("check-deploy-config: DEPLOY_TARGET is not 'hosted' — skipping.");
  process.exit(0);
}

const config = readFileSync("supabase/config.toml", "utf8");
const problems = [];

if (/^\s*enable_signup\s*=\s*true/m.test(config)) {
  problems.push("enable_signup = true — anyone could self-register on a hosted project.");
}
if (/^\s*enable_confirmations\s*=\s*false/m.test(config)) {
  problems.push("enable_confirmations = false — registrations would be pre-confirmed.");
}

if (problems.length > 0) {
  console.error("supabase/config.toml is not safe to push to a hosted project:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee docs/DEPLOY-CHECKLIST.md.");
  process.exit(1);
}

console.log("check-deploy-config: config.toml is safe for a hosted target.");
