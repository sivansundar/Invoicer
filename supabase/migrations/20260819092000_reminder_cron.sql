/**
 * The hourly reminder sweep.
 *
 * pg_cron owns the schedule, which is what keeps timing next to the data: the
 * job fires whether or not anything else is watching. It calls the app's
 * `/api/reminders/run` endpoint over pg_net rather than doing the work in
 * Postgres, because the work — which stage is owed, how the copy renders, how
 * a provider failure classifies — is tested TypeScript that a plpgsql or Deno
 * reimplementation could only duplicate. Two implementations of "which
 * reminder is owed today" is exactly the drift this feature has been built to
 * avoid.
 *
 * Missing a run is survivable by design. What is owed is derived from due
 * dates and send history, never from a queue that drains, so an hour when the
 * app was down delays reminders rather than losing them: the next run selects
 * exactly the same stages.
 */

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * Where the sweep lives and the secret that authenticates to it.
 *
 * A table rather than values written into this migration, because a migration
 * is in git and this secret must not be. Deployment inserts the two rows; see
 * the comment on `private.run_reminder_sweep` for what happens until it does.
 *
 * No RLS policies and no grants to any client role: nothing outside the
 * service role has any business reading a bearer token.
 */
create table private.app_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

/**
 * Fire the sweep.
 *
 * A no-op when the endpoint is not configured, rather than an error. This
 * runs hourly forever; a database restored into a staging project with no
 * config should sit quietly, not fill the cron log with failures nobody is
 * going to read.
 *
 * `net.http_post` returns immediately with a request id — pg_net delivers
 * asynchronously — so this function never holds a transaction open for the
 * length of a mail run.
 */
create or replace function private.run_reminder_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint text;
  secret   text;
begin
  select value into endpoint from private.app_config where key = 'reminder_sweep_url';
  select value into secret   from private.app_config where key = 'reminder_sweep_secret';

  if endpoint is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb,
    -- Generous, because the endpoint sends real mail before it answers. The
    -- sweep is idempotent, so a timeout that fires after the work has begun
    -- is harmless: the claimed slots are already claimed.
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function private.run_reminder_sweep()
  from public, anon, authenticated;

/**
 * Hourly, on the hour.
 *
 * Hourly rather than daily because a brand's stages can be a day apart, and a
 * once-a-day job makes "3 days past due" mean anything from 3 to 4 days
 * depending on when the invoice was written. Hourly is also the finest
 * granularity that stays polite: nothing here needs to notice an overdue
 * invoice within the minute.
 *
 * The sweep itself decides what is owed, so running it more often than
 * necessary costs a query and sends nothing extra — the unique constraint on
 * (invoice, stage, ordinal) makes a duplicate run a no-op rather than a
 * duplicate email.
 */
select cron.schedule(
  'reminder-sweep',
  '0 * * * *',
  $$select private.run_reminder_sweep()$$
);

comment on table private.app_config is
  'Deployment writes reminder_sweep_url and reminder_sweep_secret here. '
  'Until both exist the hourly sweep is a no-op. Never populated by a '
  'migration: these values are secrets and migrations are in git.';
