/**
 * Seed each new org's three default follow-up email templates.
 *
 * These used to be written by the client-side v1→v2 migration, which seeded
 * them into localStorage whenever the templates collection came back empty.
 * Templates live in Postgres now and that migration never touches this table,
 * so without this a new account starts with none.
 *
 * Seeding at signup rather than lazily on first read: a client-side backfill
 * would race between two tabs and would have to decide whether "empty" means
 * "new account" or "user deleted them all" — a distinction the client cannot
 * make, and getting it wrong resurrects templates somebody deliberately
 * removed.
 *
 * The ids are per-org `gen_random_uuid()`, not shared constants. `id` is the
 * primary key on its own, so one fixed uuid per template would collide on the
 * second signup. That is why `defaultFollowupConfig()` in src/lib/seed.ts no
 * longer names a default template: no id is knowable client-side any more, and
 * a brand created with a hardcoded one would carry a dangling reference.
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
