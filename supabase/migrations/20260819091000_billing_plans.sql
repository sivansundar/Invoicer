/**
 * Plan and billing state, in Postgres.
 *
 * Until now the plan lived in `localStorage` behind a `MOCK:` label — a flag
 * the browser could flip, which is fine while nothing depends on it and
 * useless the moment something does. The email quota depends on it, and a
 * quota a client can raise by editing its own storage is not a quota.
 *
 * Payment is still not wired: nothing here charges a card. What changes is
 * that the tier is now a server-side fact.
 */

-- ---------------------------------------------------------------------------
-- Tier definitions
-- ---------------------------------------------------------------------------

/**
 * What each tier is allowed. One row per tier, so raising the free allowance
 * is a one-row update.
 *
 * The limit deliberately does *not* live as a plain column on each org. That
 * shape looks simpler and is worse: changing the free tier means rewriting
 * every free org's row, any row that drifted stays wrong, and there is no
 * longer a single answer to "what does Free include?" — only a thousand
 * copies that agree until one of them does not.
 *
 * A table rather than a TypeScript constant because both readers must agree:
 * the scheduler enforcing the ceiling runs in Postgres, and the screen showing
 * "62 of 100 used" runs in the browser. Two copies of these numbers is exactly
 * the drift this table exists to prevent.
 */
create table public.plan_tiers (
  tier                 text primary key check (tier in ('free', 'pro')),
  label                text not null,
  monthly_email_limit  int not null check (monthly_email_limit >= 0),
  -- Display order for the upgrade UI; not every tier list is alphabetical.
  sort_order           int not null
);

-- Indicative figures. Changing them is an update to these two rows and takes
-- effect on the next send — no backfill, no migration.
insert into public.plan_tiers (tier, label, monthly_email_limit, sort_order)
values
  ('free', 'Free', 100, 1),
  ('pro',  'Pro',  500, 2);

-- ---------------------------------------------------------------------------
-- Per-org billing state
-- ---------------------------------------------------------------------------

/**
 * One row per org: which tier it is on, and everything a payment provider
 * will eventually need to hang off it.
 *
 * The provider columns are nullable and `provider` defaults to 'none' because
 * no payment integration exists yet. They are here now so that wiring one up
 * later is an update path rather than another migration against live billing
 * data — the table people are most reluctant to alter under load.
 */
create table public.org_billing (
  org_id                    uuid primary key references public.orgs(id) on delete cascade,
  tier                      text not null default 'free'
                              references public.plan_tiers(tier),
  status                    text not null default 'active'
                              check (status in ('active', 'past_due', 'cancelled')),
  /**
   * The subscription period, when there is a real subscription. Both null
   * means quota is counted against the calendar month, which is the honest
   * default for an account that has never been billed — there is no billing
   * anniversary to anchor to.
   */
  current_period_start      date,
  current_period_end        date,
  renews_on                 date,
  provider                  text not null default 'none'
                              check (provider in ('none', 'razorpay')),
  provider_customer_id      text,
  provider_subscription_id  text,
  /**
   * A per-org allowance that wins over the tier's. Null is the normal state.
   * Exists for the support case — "we told this customer they could send
   * 5000 this month" — which otherwise gets done by inventing a bespoke tier
   * that then has to be maintained forever.
   */
  email_limit_override      int check (email_limit_override >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint org_billing_period_paired check (
    (current_period_start is null) = (current_period_end is null)
  )
);

-- Every org that already exists predates this table.
insert into public.org_billing (org_id)
select id from public.orgs
on conflict (org_id) do nothing;

-- ---------------------------------------------------------------------------
-- Quota
-- ---------------------------------------------------------------------------

/**
 * The window quota is counted over: the subscription period when one is set,
 * otherwise the calendar month.
 *
 * Split out so the trigger that enforces the ceiling and the function that
 * reports it to a screen cannot disagree about where the month starts — a
 * disagreement that would show a user "40 of 100 used" while their send was
 * refused.
 */
create or replace function private.email_quota_period(p_org_id uuid)
returns table (period_start date, period_end date)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(b.current_period_start, date_trunc('month', now())::date),
    coalesce(
      b.current_period_end,
      (date_trunc('month', now()) + interval '1 month - 1 day')::date
    )
  from public.org_billing b
  where b.org_id = p_org_id;
$$;

/**
 * How much of an org's monthly email allowance is gone, and how much is left.
 *
 * `used` is counted from `reminder_sends` rather than read from a counter
 * column. A counter is one bug away from disagreeing with what actually went
 * out, and the direction it drifts — over-counting after a rollback,
 * under-counting after a crash between send and increment — is exactly the
 * direction that either blocks a paying customer or lets the ceiling leak.
 * Counting rows cannot drift; it can only be slow, and the partial index on
 * (org_id, sent_at) is there so it is not.
 *
 * `queued` counts against the allowance alongside `sent`: a row in flight is
 * a message about to exist, and letting concurrent runs each see it as free
 * is how a limit gets exceeded by exactly the number of workers.
 */
create or replace function private.email_quota_for(p_org_id uuid)
returns table (
  tier          text,
  tier_label    text,
  monthly_limit int,
  used          int,
  remaining     int,
  period_start  date,
  period_end    date,
  over_limit    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with period as (
    select * from private.email_quota_period(p_org_id)
  ),
  allowance as (
    select
      b.tier,
      t.label as tier_label,
      coalesce(b.email_limit_override, t.monthly_email_limit) as monthly_limit
    from public.org_billing b
    join public.plan_tiers t on t.tier = b.tier
    where b.org_id = p_org_id
  ),
  consumed as (
    select count(*)::int as used
    from public.reminder_sends s, period p
    where s.org_id = p_org_id
      and s.status in ('sent', 'queued')
      -- `sent_at` is null while queued, so fall back to when the row was
      -- claimed. Without this a queued row escapes every period and the
      -- allowance leaks by however many are in flight.
      and coalesce(s.sent_at, s.created_at)::date between p.period_start and p.period_end
  )
  select
    a.tier,
    a.tier_label,
    a.monthly_limit,
    c.used,
    greatest(a.monthly_limit - c.used, 0),
    p.period_start,
    p.period_end,
    c.used >= a.monthly_limit
  from allowance a, consumed c, period p;
$$;

/**
 * The same numbers, for the caller's own org.
 *
 * A separate entry point rather than one function taking an org id, because
 * the two callers need opposite things: a browser must never be able to name
 * an org it does not belong to, and the scheduler has no `auth.uid()` to
 * resolve. Splitting them means neither needs a branch that decides how much
 * to trust its argument — the branch that, got wrong, reads another tenant's
 * billing.
 *
 * `security definer` because `authenticated` deliberately has no `usage` on
 * schema `private`, so an invoker-rights version fails for exactly the users
 * it exists to serve. It takes no arguments and resolves the org from
 * `auth.uid()` inside the body, so there is nothing a caller can pass to
 * widen what it returns — the same shape, and the same reasoning, as
 * `private.is_org_member`. A member of two orgs gets a row for each.
 */
create or replace function public.email_quota()
returns table (
  tier          text,
  tier_label    text,
  monthly_limit int,
  used          int,
  remaining     int,
  period_start  date,
  period_end    date,
  over_limit    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.*
  from public.org_members m
  cross join lateral private.email_quota_for(m.org_id) q
  where m.user_id = (select auth.uid());
$$;

/**
 * Enforce the ceiling where it cannot be forgotten.
 *
 * A check in the scheduler would work until the manual-chase route forgot it,
 * or a backfill script did. This fires on every row that tries to enter the
 * `queued` state from any code path at all, which is the only version of this
 * rule that stays true as the number of senders grows.
 *
 * Over the limit, the send is recorded as `blocked` rather than rejected. The
 * user then sees, against the specific invoice, that a reminder was due and
 * why it did not go — which is the whole question they would otherwise be
 * asking support. A blocked row keeps its slot, so the next run after the
 * period rolls over retries it in place by moving it back to `queued`.
 */
create or replace function private.enforce_email_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
begin
  -- Only a row about to be sent consumes allowance. `legacy` and `recorded`
  -- are history that predates sending; `failed` and `blocked` already had
  -- their chance.
  if new.status is distinct from 'queued' then
    return new;
  end if;

  select * into q from private.email_quota_for(new.org_id);

  if q is null then
    -- No billing row means no allowance can be computed. Refusing to send is
    -- the safe direction: the alternative is unlimited mail from an org whose
    -- plan nobody knows.
    new.status := 'blocked';
    new.error := 'No plan on file for this workspace';
    return new;
  end if;

  if q.over_limit then
    new.status := 'blocked';
    new.error := format(
      'Monthly email limit reached — %s of %s used on the %s plan',
      q.used, q.monthly_limit, q.tier_label
    );
  end if;

  return new;
end;
$$;

create trigger reminder_sends_enforce_quota
  before insert or update of status on public.reminder_sends
  for each row
  execute function private.enforce_email_quota();

-- ---------------------------------------------------------------------------
-- Signup
-- ---------------------------------------------------------------------------

/**
 * Give every new org a billing row.
 *
 * Appended to the existing signup trigger rather than added as a second
 * trigger on `auth.users`: two triggers on one table have an ordering that
 * depends on their names, and this one must run after the org it references
 * exists.
 */
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  insert into public.orgs (name)
  values (coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    'My workspace'
  ))
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  insert into public.org_billing (org_id) values (new_org_id);

  -- Copy kept in sync with SEED_TEMPLATES in src/lib/seed.ts, which remains
  -- the source for the localStorage importer's own normalisation path.
  insert into public.email_templates (org_id, name, tone, subject, body)
  values
    (new_org_id, 'Gentle nudge', 'Friendly',
     'A small nudge about {{invoice}}',
     'Hi {{client}},' || chr(10) || chr(10) ||
     'Hope the week is treating you kindly. Just floating {{invoice}} back to the top of your inbox — {{amount}} was due on {{due_date}}.' || chr(10) || chr(10) ||
     'The payment details are on the invoice, and I''ve attached a copy for convenience. If it''s already on its way, ignore me entirely.' || chr(10) || chr(10) ||
     'Warmly,' || chr(10) || '{{brand}}'),
    (new_org_id, 'Second reminder', 'Direct',
     '{{invoice}} — {{days_late}} days past due',
     'Hi {{client}},' || chr(10) || chr(10) ||
     '{{invoice}} for {{amount}} is now {{days_late}} days past its due date of {{due_date}}.' || chr(10) || chr(10) ||
     'Could you let me know when I can expect the transfer? Happy to re-send the invoice or share alternate payment details if that helps.' || chr(10) || chr(10) ||
     'Thanks,' || chr(10) || '{{brand}}'),
    (new_org_id, 'Final notice', 'Firm',
     'Final reminder: {{invoice}} ({{amount}})',
     'Hi {{client}},' || chr(10) || chr(10) ||
     'This is my last automated reminder for {{invoice}}, outstanding since {{due_date}} — {{amount}}.' || chr(10) || chr(10) ||
     'If payment isn''t settled this week I''ll follow up directly to sort out next steps. I''d much rather close this quietly.' || chr(10) || chr(10) ||
     'Regards,' || chr(10) || '{{brand}}');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.org_billing enable row level security;
alter table public.org_billing force row level security;

create policy org_billing_select on public.org_billing
  for select to authenticated
  using ((select private.is_org_member(org_id)));

/**
 * Read-only to clients, deliberately. A tier a browser can write is a tier
 * every browser can grant itself, which would make both the plan gate and the
 * email quota decorative. Upgrades arrive through a payment provider's
 * webhook, server-side, when one exists.
 */

alter table public.plan_tiers enable row level security;
alter table public.plan_tiers force row level security;

-- Tier definitions are public product information: the upgrade screen has to
-- render "Pro — 500 emails a month" for someone not yet on Pro.
create policy plan_tiers_select on public.plan_tiers
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant all on public.org_billing, public.plan_tiers to service_role;
grant select on public.org_billing, public.plan_tiers to authenticated;

revoke execute on function private.email_quota_for(uuid),
                          private.email_quota_period(uuid),
                          private.enforce_email_quota()
  from public, anon, authenticated, service_role;

grant execute on function public.email_quota() to authenticated;
