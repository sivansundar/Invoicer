/**
 * Let `create_invoice` accept an id and invoice number instead of allocating
 * them.
 *
 * Restoring a backup is the case this exists for. A restored invoice is not
 * a new document — it may already be in a client's inbox under the number it
 * was issued with, and renumbering it on restore would make the customer's
 * records and the app's disagree. The same applies to its id: an invoice's
 * id is what its brand and client references point at inside the same file.
 *
 * Allocation stays the default. Passing nothing behaves exactly as before,
 * which is what the invoice form does; only the importer supplies these.
 *
 * This does not weaken the numbering guarantee. `invoices_number_unique` and
 * `invoices_seq_unique` still reject a collision whichever path produced it,
 * and a caller could already choose its own number on import — that is what
 * the rename dialog in import-export.tsx is for.
 *
 * `number_year`/`number_seq` are supplied by the caller rather than parsed
 * from the number here: `src/lib/numbering.ts` already understands both the
 * legacy hyphen-free format ("SC2026001") and the current one, and it is
 * tested. Re-implementing that regex in plpgsql would be a second parser to
 * keep in step with the first. They stay nullable — a legacy number that
 * will not parse is stored verbatim with no sequence, which the schema
 * already allows for exactly this reason.
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
  v_given_number text := nullif(payload->>'invoice_number', '');
  v_prefix text;
  v_seq int;
  v_number text;
  v_number_year int;
  v_invoice public.invoices;
begin
  -- The lock must be taken BEFORE the max() below, or the race this function
  -- exists to close is still open: two transactions would both read the same
  -- highest sequence and only the unique constraint would stop them, turning
  -- a correct allocation into a retry. RLS decides which brand rows are
  -- lockable at all, so this cannot serialise against another org's work.
  --
  -- Taken on the preserved-number path too: a restore running alongside a
  -- create must not interleave with the other's allocation read.
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

  if v_given_number is not null then
    v_number := v_given_number;
    v_number_year := (payload->>'number_year')::int;
    v_seq := (payload->>'number_seq')::int;
  else
    select coalesce(max(number_seq), 0) + 1 into v_seq
      from public.invoices
     where brand_id = v_brand_id
       and number_year = v_year;

    v_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');
    v_number_year := v_year;
  end if;

  insert into public.invoices (
    id, brand_id, client_id, invoice_number, number_year, number_seq,
    status, currency, bill_date, due_date, paid_on,
    client_snapshot, brand_snapshot,
    subtotal, total_tax, total, notes, reminders, followups_paused
  )
  values (
    coalesce(nullif(payload->>'id', '')::uuid, gen_random_uuid()),
    v_brand_id,
    nullif(payload->>'client_id', '')::uuid,
    v_number,
    v_number_year,
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

  -- Written out rather than shared with update_invoice — see the note above
  -- create_invoice in *_invoice_rpcs.sql for why a private helper is not an
  -- option here.
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
