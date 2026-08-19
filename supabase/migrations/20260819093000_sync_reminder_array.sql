/**
 * Keep `invoices.reminders` true.
 *
 * The column was demoted to a derived copy when `reminder_sends` became the
 * source of truth — and then nothing derived it. The old writer was the fake
 * "Send one now" handler, which appended a date and was deleted along with the
 * pretence that it sent anything. Between that deletion and this trigger, a
 * reminder could go out and the array would never know.
 *
 * A trigger rather than a line in the sweep, for the same reason the quota is
 * a trigger: the sweep is not the only writer. The manual chase route writes
 * too, a support fix might, and a future sender certainly will. An invariant
 * maintained by every writer remembering to maintain it is an invariant that
 * lasts until the third writer.
 *
 * Only `sent` counts. A queued row has not gone yet, and a blocked or failed
 * one never did — putting either in the array would inflate every "reminders
 * sent" figure in the app with mail that does not exist.
 */
create or replace function private.sync_invoice_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_day date;
begin
  if new.status is distinct from 'sent' then
    return new;
  end if;
  -- Unchanged status means this update was about something else (a provider
  -- id landing, say) and the date is already in the array.
  if tg_op = 'UPDATE' and old.status = 'sent' then
    return new;
  end if;

  sent_day := coalesce(new.sent_at::date, new.scheduled_for, current_date);

  update public.invoices
  set reminders = (
        select array_agg(d order by d)
        from (
          select unnest(reminders) as d
          union all
          select sent_day
        ) merged
      ),
      updated_at = now()
  where id = new.invoice_id;

  return new;
end;
$$;

create trigger reminder_sends_sync_invoice
  after insert or update of status on public.reminder_sends
  for each row
  execute function private.sync_invoice_reminders();

revoke execute on function private.sync_invoice_reminders()
  from public, anon, authenticated, service_role;

comment on column public.invoices.reminders is
  'Derived from reminder_sends by the reminder_sends_sync_invoice trigger, '
  'and holding only dates that were actually sent. reminder_sends is the '
  'source of truth and carries the stage, the copy and the outcome; this '
  'array survives for backups, exports and older readers.';
