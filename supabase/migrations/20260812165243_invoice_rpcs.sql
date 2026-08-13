/**
 * Transactional invoice create and update.
 *
 * Two problems these solve, both of which are invisible until there are two
 * tabs or a slow network:
 *
 * 1. Numbering. `src/lib/numbering.ts` picks the next sequence with a
 *    client-side max() over whatever invoices that tab happens to hold. Two
 *    tabs both read 14, both write 15, and two real, sent documents carry the
 *    same number. Allocation moves in here, under a row lock on the brand.
 *
 * 2. Line items live in their own table. Over PostgREST, replacing them is
 *    delete-then-insert as two requests; a failure between them leaves an
 *    invoice with no items and a total matching nothing. In here it is one
 *    statement pair in one transaction.
 *
 * Both are `security invoker`, so RLS applies to the caller exactly as it
 * does to a direct query. A `security definer` version would hand every
 * caller every org's invoices — the brand lookup below would find any brand
 * in the database rather than only the caller's.
 */

/**
 * The item-expanding INSERT below is written out in both functions rather
 * than factored into a shared helper.
 *
 * A helper would have to live in `private`, and calling it from a
 * `security invoker` function means the *caller* needs USAGE on that schema
 * — which `authenticated` deliberately does not have (`private` has no ACL
 * at all; Phase 1's helpers are reachable only because policy and default
 * expressions are evaluated differently from a direct call). Granting schema
 * USAGE to make one helper work would widen a boundary Phase 1 drew on
 * purpose, to save ten lines. The alternative, `security definer`, would let
 * the helper write `invoice_items` rows with RLS bypassed — the last thing
 * this table should allow.
 *
 * `position` comes from array order (`with ordinality`), which is what the
 * UI's ordering means and what the read path sorts by. Deriving it here
 * rather than trusting a client-supplied index means a payload with
 * duplicate or missing positions cannot scramble the order.
 */

create or replace function public.create_invoice(payload jsonb)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand_id uuid := (payload->>'brand_id')::uuid;
  v_bill_date date := (payload->>'bill_date')::date;
  v_year int := extract(year from v_bill_date);
  v_prefix text;
  v_seq int;
  v_invoice public.invoices;
begin
  -- The lock must be taken BEFORE the max() below, or the race this function
  -- exists to close is still open: two transactions would both read the same
  -- highest sequence and only the unique constraint would stop them, turning
  -- a correct allocation into a retry. RLS decides which brand rows are
  -- lockable at all, so this cannot serialise against another org's work.
  select invoice_prefix into v_prefix
    from public.brands
   where id = v_brand_id
   for update;

  if not found then
    -- Deliberately not "brand not found in your organisation" — under
    -- security invoker a brand belonging to someone else is simply not
    -- visible, and saying otherwise would confirm the id exists.
    raise exception 'brand not found' using errcode = 'P0002';
  end if;

  select coalesce(max(number_seq), 0) + 1 into v_seq
    from public.invoices
   where brand_id = v_brand_id
     and number_year = v_year;

  insert into public.invoices (
    brand_id, client_id, invoice_number, number_year, number_seq,
    status, currency, bill_date, due_date, paid_on,
    client_snapshot, brand_snapshot,
    subtotal, total_tax, total, notes, reminders, followups_paused
  )
  values (
    v_brand_id,
    nullif(payload->>'client_id', '')::uuid,
    v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0'),
    v_year,
    v_seq,
    coalesce(payload->>'status', 'draft'),
    payload->>'currency',
    v_bill_date,
    (payload->>'due_date')::date,
    nullif(payload->>'paid_on', '')::date,
    payload->'client_snapshot',
    payload->'brand_snapshot',
    coalesce((payload->>'subtotal')::numeric, 0),
    coalesce((payload->>'total_tax')::numeric, 0),
    coalesce((payload->>'total')::numeric, 0),
    payload->>'notes',
    coalesce(
      (select array_agg(value::text::date)
         from jsonb_array_elements_text(coalesce(payload->'reminders', '[]'::jsonb)) as value),
      '{}'::date[]
    ),
    coalesce((payload->>'followups_paused')::boolean, false)
  )
  returning * into v_invoice;

  insert into public.invoice_items (invoice_id, position, description, amount, tax)
  select
    v_invoice.id,
    ordinality - 1,
    coalesce(item->>'description', ''),
    coalesce((item->>'amount')::numeric, 0),
    coalesce((item->>'tax')::numeric, 0)
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
       with ordinality as t(item, ordinality);

  return v_invoice;
end;
$$;

/**
 * Updates everything about an invoice except its identity.
 *
 * `invoice_number`, `number_year` and `number_seq` are never touched: a
 * number, once issued, names a document that may already be in somebody's
 * inbox. Reallocating it on edit would silently renumber a sent invoice.
 */
create or replace function public.update_invoice(payload jsonb)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_invoice public.invoices;
begin
  update public.invoices set
    client_id = nullif(payload->>'client_id', '')::uuid,
    status = coalesce(payload->>'status', status),
    currency = coalesce(payload->>'currency', currency),
    bill_date = coalesce((payload->>'bill_date')::date, bill_date),
    due_date = coalesce((payload->>'due_date')::date, due_date),
    paid_on = nullif(payload->>'paid_on', '')::date,
    client_snapshot = coalesce(payload->'client_snapshot', client_snapshot),
    brand_snapshot = coalesce(payload->'brand_snapshot', brand_snapshot),
    subtotal = coalesce((payload->>'subtotal')::numeric, subtotal),
    total_tax = coalesce((payload->>'total_tax')::numeric, total_tax),
    total = coalesce((payload->>'total')::numeric, total),
    notes = payload->>'notes',
    reminders = coalesce(
      (select array_agg(value::text::date)
         from jsonb_array_elements_text(coalesce(payload->'reminders', '[]'::jsonb)) as value),
      '{}'::date[]
    ),
    followups_paused = coalesce((payload->>'followups_paused')::boolean, followups_paused),
    updated_at = now()
  where id = v_id
  returning * into v_invoice;

  -- RLS makes another org's invoice invisible rather than forbidden, so a
  -- cross-tenant update affects zero rows and reports no error. Without this
  -- check the caller would be told the edit succeeded.
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;

  -- Replace the whole item set rather than diffing: the client sends the
  -- list it wants to end up with, and both statements are in this
  -- function's transaction, so there is no window where the invoice has no
  -- items.
  delete from public.invoice_items where invoice_id = v_id;
  insert into public.invoice_items (invoice_id, position, description, amount, tax)
  select
    v_id,
    ordinality - 1,
    coalesce(item->>'description', ''),
    coalesce((item->>'amount')::numeric, 0),
    coalesce((item->>'tax')::numeric, 0)
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
       with ordinality as t(item, ordinality);

  return v_invoice;
end;
$$;

-- Exposed over PostgREST, so the grant is the access boundary. `anon` and
-- `public` stay revoked: an unauthenticated caller has no org, and every
-- statement inside would fail RLS anyway — but an RPC reachable without a
-- session is a surface worth not having.
revoke execute on function public.create_invoice(jsonb) from public, anon;
revoke execute on function public.update_invoice(jsonb) from public, anon;
grant execute on function public.create_invoice(jsonb) to authenticated;
grant execute on function public.update_invoice(jsonb) to authenticated;
