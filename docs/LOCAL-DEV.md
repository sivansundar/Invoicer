# Running Invoicer locally

Everything here runs against a local Supabase stack in Docker. There is no hosted project yet.

## Prerequisites

- **Docker Desktop running.** If the daemon is down, the Supabase CLI reports
  `failed to connect to the docker API at unix:///…/docker.sock` and the integration suite fails
  with `ECONNREFUSED 127.0.0.1:54422`. Start Docker and retry — nothing is wrong with the code.
- **Supabase CLI ≥ 2.81.3** (`supabase --version`). `supabase db advisors` needs that floor.
- Node 18+ and npm.

## Ports — this project does not use the Supabase defaults

Another Supabase project on this machine holds the default `543xx` block, so Invoicer is
configured for `544xx`. That is deliberate, is explained in `supabase/config.toml`, and should
not be "corrected" back — it is what lets both projects run side by side.

| Service | URL |
|---|---|
| API | http://127.0.0.1:54421 |
| Database | `postgresql://postgres:postgres@127.0.0.1:54422/postgres` |
| Studio | http://127.0.0.1:54423 |
| Mail catcher (Mailpit) | http://127.0.0.1:54424 |

`supabase status -o env` is the source of truth if these ever drift.

## First-time setup

```bash
supabase start          # first run pulls images and takes a few minutes
supabase status -o env  # the values for the env files below
```

Create **`.env.local`** (gitignored) — what the app itself needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from supabase status>
```

`NEXT_PUBLIC_SITE_URL` (optional locally, required in any deployed environment) sets
`metadataBase` in `src/app/layout.tsx` so relative Open Graph/Twitter image paths resolve
against the right host. Unset, `next dev` falls back to `http://localhost:3000`, which is only
ever correct locally — a deployed build without it points social share cards at a host the
crawler cannot reach.

Create **`.env.test.local`** (gitignored) — what the integration suite needs. It uses the
service-role key and a direct Postgres connection; the app uses neither:

```bash
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
```

`.env.local.example` carries both sets with the same guidance.

## Running and signing in

```bash
npm run dev     # http://localhost:3000
```

1. `http://localhost:3000` is the marketing placeholder. Any app route (`/dashboard`, `/brands`,
   …) redirects to `/login?next=<where you were headed>`.
2. Enter any email address. No account is needed — the first sign-in creates the user, and a
   database trigger creates their org automatically.
3. Open **Mailpit at http://127.0.0.1:54424**, open the newest message, click the sign-in link.
4. You land on the page you originally asked for, signed in, with your email in the sidebar.

Sign-out is the icon in the sidebar footer; it clears the session server-side, so `/dashboard`
redirects back to `/login` afterwards.

**Google sign-in renders but cannot work locally.** It needs real OAuth credentials that
`supabase/config.toml` does not carry. The button failing gracefully is the expected behaviour.

## After changing `supabase/config.toml`

**`supabase start` on its own is not enough.** It restarts the existing containers and keeps
their environment, so config edits silently do not take effect — you see the old behaviour and
conclude the change did not work. Recreate the containers:

```bash
supabase stop
supabase start
```

Verify a setting actually reached the container rather than trusting the file:

```bash
docker inspect supabase_auth_saas-phase1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep GOTRUE_URI_ALLOW_LIST
```

## Tests

```bash
npm test                  # unit — no Docker needed
npm run test:integration  # needs the stack running
npm run lint
npm run build             # route list should include "ƒ Proxy (Middleware)"
```

The integration suite talks to real Postgres and real auth. It never resets the database and
creates a uniquely-named user per test, so runs are independent and leftover data is harmless.

Replay migrations from scratch with `supabase db reset`.

## Things that will otherwise confuse you

- **A `redirect_to` outside the allow-list is not rejected loudly.** GoTrue silently substitutes
  `site_url`, so you land on the dashboard instead of the page you asked for, with no error
  anywhere. `additional_redirect_urls` in `config.toml` covers `http://127.0.0.1:3000` and
  `http://localhost:3000/**`.
- **Magic-link rate limit.** `email_sent = 2` per hour in `config.toml`. Iterating on the sign-in
  flow will hit it; raise it locally if you need to.
- **`.next/types` can go stale** after route changes and produce phantom `tsc` errors. `rm -rf
  .next` and rebuild.
- **The build must show `ƒ Proxy (Middleware)`.** Its absence means `src/proxy.ts` is not being
  detected — the auth guard would be silently inert. It lives in `src/`, not the repo root,
  because this project uses a `src/app` layout.
