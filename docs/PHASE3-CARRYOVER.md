# Phase 2 carry-over — read before starting Phase 3

Written at the end of the SaaS Phase 2 branch (`feat/saas-phase2-data`, 11 commits, 528 unit +
102 integration tests). Everything here was found during execution, consciously deferred, or
decided in a way the next phase needs to know about.

Phase 2 moved every piece of app data out of `localStorage` and into Postgres, and fixed invoice
numbering. **What is still local: theme, the dashboard's brand filter, and the mock plan flag** —
per-device preference, not data. See `docs/superpowers/plans/2026-08-12-saas-phase2-data-layer.md`
for the plan and the decisions it records.

Items inherited from `docs/PHASE2-CARRYOVER.md` that are now closed: the numbering RPC, the
`TRUNCATE`/grants test gaps, the `Shell` hoist, the `vitest` exclude bug, and the tenancy cascade
test. The rest of that document's operational and polish items are repeated below rather than
left behind in a file about a finished phase.

---

## Do this first in Phase 3

### 1. Brand logos are on a bridge column, not in Storage

`brands.logo_data text` holds the same base64 data URL the app has always produced. It exists so
that moving the data layer did not silently break logo upload; it is explicitly not the design.
`brands.logo_path` is already in the schema, unused, for the real thing.

The logos phase migrates `logo_data` → Storage and drops the column. Two details from the spec
(§8) that are easy to miss: the bucket policies need INSERT **and** SELECT **and** UPDATE for
upsert to work, and `@react-pdf/renderer` currently embeds the base64 straight from the record —
with Storage it has to fetch the object and convert it before rendering, or PDF generation
breaks.

### 2. The `localStorage` importer prompt does not exist yet

Spec §11 wants a one-time prompt after first sign-in: "We found 14 invoices on this device.
Import them into your account?" None of that is built. What **is** built is the machinery it
needs — `import-validation.ts` to validate, `migrateToV2` to normalise, `import-remap.ts` to
make ids storable, and the whole import path in `import-export.tsx` that already does exactly
this for a backup file.

Phase 2 deliberately stopped touching local data: `Shell` no longer runs the migration on mount,
so anything a user has from the local-only build is sitting untouched under `invoicer_*` keys.
That is the raw material for this prompt, and it stays valid indefinitely.

**Local data must not be deleted after import.** A separate "clear local copy" action, after the
user has seen the result, is the spec's position and it is the right one.

---

## Decisions Phase 2 made that Phase 3 should not silently reverse

- **`org_id` never appears in application code.** It is filled by a column default
  (`private.current_org_id()`), and RLS is the only read filter. Passing it explicitly is a bug
  even when it produces the right answer.
- **The seam throws; it does not return `false`.** `tsc` cannot catch a regression here —
  `if (!save(x))` on a promise is never true — so a caller that branches on a boolean will fail
  silently. Convert callers by hand, not by trusting the typechecker.
- **`createInvoice` is separate from `saveInvoice`.** Dispatching internally would need a round
  trip to learn whether the row exists, and guessing wrong either renumbers a sent invoice or
  fails an edit.
- **Creating an invoice is not optimistic**, unlike every other mutation: the server allocates
  the number, so an optimistic insert shows a number the invoice does not have.
- **Unit tests drive an in-memory fake of the seam** (`src/test/fake-seam.ts`), not MSW.
  `fake-seam.test.ts` asserts the fake exports exactly what the real module does — keep it
  passing when the seam changes, or every test that mocks storage starts calling `undefined`.

---

## Test gaps worth closing

- **The optimistic-rollback tests taught a lesson worth repeating.** The first version passed
  with the rollback deleted, because `onSettled` invalidates and the refetch restores the right
  value regardless. Any test of a transient state has to reach that state directly. See the
  handler-level block in `src/hooks/optimistic.test.tsx`.
- **No test covers two *browsers* creating invoices at once.** `rpc.test.ts` fires concurrent
  RPCs from one client, which is what exercises the lock, but the end-to-end path (two tabs,
  each with its own provisional number, both saving) is only reasoned about.
- **`/reports` and `/invoices/[id]` have skeletons but no loading-state test.**
  `loading-states.test.tsx` covers the list and edit screens; those two were wired by hand and
  are only checked by eye.

---

## Operational

- **`supabase/config.toml` is production-unsafe as committed.** `enable_signup = true` with
  `enable_confirmations = false` is correct locally — it is what lets the integration tests use
  `signInWithPassword` — but the CLI pushes this file verbatim. On a hosted project it would let
  anyone self-register an arbitrary email, pre-confirmed, while the product's stated auth surface
  is magic link + Google only. **The deploy checklist must gate it.** Carried from Phase 1,
  still true, still ungated.
- **Wire the proxy's `getClaims()` catch to Sentry** when Phase 3 adds it
  (`src/lib/supabase/proxy.ts`). It `console.warn`s and fails closed, so a JWKS outage logs every
  user out with only a console line as signal.
- **`pg_default_acl` retains a second entry owned by `supabase_admin`** granting
  `TRUNCATE/REFERENCES/TRIGGER` to `anon`/`authenticated` on any table that role creates in
  `public`. The revoke covers the `postgres` grantor, which is the one migrations run as, so it
  is not reachable through the normal path. Worth knowing before assuming the revoke is global.
- **Deleting a user orphans their org rather than cascading.** `org_members.user_id` cascades
  from `auth.users`; `orgs` does not cascade from `org_members`. Pinned by a test in
  `tenancy.test.ts` so it stays a decision. The DPDP erasure path has to remove the org
  deliberately.

---

## Known limitations, stated so they are not discovered

- **Re-importing the same pre-Postgres backup duplicates records whose ids were rewritten.**
  Those ids are replaced with fresh ones, so the second import has nothing to match against.
  Deterministic remapping would fix it but cannot be used: `email_templates.id` is a global
  primary key, so hashing a legacy id to a fixed uuid makes two different accounts importing the
  same backup collide. The import summary tells the user when this applies.
- **Import is not all-or-nothing.** Conflict resolution is interactive across several dialog
  round-trips, so no transaction spans it. Per-record accounting is accurate instead. A single
  `import_backup` RPC could make the no-conflict path atomic, but a restore that is atomic only
  when it happens not to collide is a worse contract than one that is never atomic and always
  accurate.
- **Nothing enforces a per-account data cap.** Every write is an authenticated insert with no
  size or row limit. That was implicitly bounded by the `localStorage` quota before.

---

## Polish

- `src/lib/supabase/{client,server,proxy}.ts` use `process.env.X!` with no runtime guard, unlike
  `src/test/integration/helpers.ts` which validates and throws a useful message. A missing
  `.env.local` fails deep inside the Supabase SDK.
- `src/app/(auth)/login/page.tsx` surfaces raw Supabase error strings via `toast(error.message)`.
  The app's own copy is hand-written, dry and second-person; provider text reads as foreign.
  Wants a copy pass alongside the real landing page.
- The Google sign-in button has no pending/disabled state, unlike the email form.
- `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts` lists `/pricing`, `/privacy` and `/terms`, which
  do not exist as routes yet. Deliberate — the landing-page plan adds them.
- `Brand.nextInvoiceNumber` is dead. The mapper drops it, but the field is still on the type and
  in every fixture. Removing it is a mechanical change nobody has made.
- `docs/POST-MERGE-NOTES.md` residuals still open: no confirmation on client delete, two stray
  `alert()` calls.

---

## Process note, carried forward

Phase 1's lesson was that a plan amended mid-execution grows stale global sections. Phase 2's is
narrower and sharper: **falsify a test before trusting it.** Three separate assertions in this
phase passed for the wrong reason — the concurrency test, the optimistic rollbacks, and a
first attempt at the remount guard whose key never actually changed. Each was caught by breaking
the code on purpose and checking the test noticed. None would have been caught by review.
