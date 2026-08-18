# Deploy checklist

Run before `supabase link` + `supabase db push` against any hosted project.

## Blocking

- [ ] `DEPLOY_TARGET=hosted npm run check:deploy-config` exits 0.
      It will not until `enable_signup` is `false` under `[auth]` and
      `[auth.email]`, and `enable_confirmations` is `true` under
      `[auth.email]`, in `supabase/config.toml`. Both are deliberately the
      other way round for the local stack — see the script's comment. The
      script is section-aware and ignores `[auth.sms]`'s own copies of both
      settings (that provider is disabled and unrelated to this risk), so
      fixing `[auth]`/`[auth.email]` alone is enough — no need to touch
      `[auth.sms]`.
- [ ] Integration tests are green against the **local** stack. Flipping the
      two settings above breaks `signInWithPassword`, so do not commit the
      flipped file: change it for the push, or override it per environment.
- [ ] `NEXT_PUBLIC_SITE_URL` is set to the deployed origin **and is a valid
      absolute URL, scheme included** (e.g. `https://app.example.com`, not
      `app.example.com`). `src/app/layout.tsx` calls `new URL(...)` on this
      value at module-eval time to build `metadataBase`; a malformed value
      throws `ERR_INVALID_URL` there, which breaks the build and every
      prerender that touches the root layout — an all-routes hard failure,
      not a degraded one. That call is deliberately not wrapped in a
      try/catch: a silent fallback would make a misconfigured deploy look
      healthy while every social preview pointed at localhost. The loud
      failure is the point; this checklist is where it should get caught
      instead of in production.
- [ ] Google OAuth credentials are configured, or the button is hidden.
      It renders today and cannot work without them.
- [ ] `service_role` appears nowhere outside `.env.test.local`. Verify:
      `grep -rn "service_role" --exclude-dir=node_modules . | grep -v ".env.test.local"`
- [ ] A restore from a fresh backup has actually been performed, not assumed.
- [ ] Any CI/deploy pipeline step that runs `supabase db reset` and then
      talks to the REST or Storage API has an explicit PostgREST readiness
      gate — poll `/rest/v1/` until it responds, don't rely on a fixed retry
      count or sleep. After a reset, PostgREST returns "Could not query the
      database for the schema cache" until it has reloaded the schema, and
      that warm-up took three consecutive integration runs to clear during
      this branch's work, not one. See `docs/LOCAL-DEV.md`.

## Known to be missing at the time of writing

Not blocking a private deploy; blocking a public launch.

- No privacy policy or terms page. `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts`
  already routes `/privacy` and `/terms`; neither exists.
- No DPDP consent, export or erasure flow. Erasure must delete the org
  deliberately (it does not cascade from `org_members`) **and** delete each
  brand's Storage objects individually — the object path is
  `{brandId}/{sha}.png`, keyed by brand, so no single prefix covers an org.
- No error monitoring. `proxy.ts`'s `getClaims()` catch fails closed and only
  `console.warn`s; a JWKS outage logs every user out with no signal.
- No per-account data cap. Every write is an unbounded authenticated insert.
- `FEATURES.billing` and `FEATURES.followups` are both `false` and must stay
  that way: billing takes no payment and follow-ups send no email, but both
  look complete on screen.
