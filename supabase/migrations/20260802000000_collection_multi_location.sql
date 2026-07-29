-- One row per (card, bucket, location), so copies can be split across places:
-- 1 in Box 1, 4 in Box 2, 2 in Alice's deck.
--
-- Replaces the fixed three-pair shape (quantity/location, sale_*, loaned_*),
-- which allowed exactly one place per bucket. `bucket` now carries the meaning
-- and `location` the place — or, for a loan, the person holding the cards, since
-- "where is it" and "who has it" are the same question from the owner's side.
--
-- The whole conversion is guarded on sale_quantity still existing, so re-running
-- this migration is a no-op rather than a second, destructive pass.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_collections'
      and column_name = 'sale_quantity'
  ) then
    raise notice 'user_collections already converted, skipping';
    return;
  end if;

  -- One row per card becomes one row per place, so this has to go before the
  -- split inserts below.
  alter table public.user_collections
    drop constraint if exists user_collections_user_id_card_id_key;
  alter table public.user_collections
    drop constraint if exists user_collections_loan_has_borrower;

  alter table public.user_collections add column if not exists bucket text;

  -- Carry the for-sale and loaned counts out into their own rows first, while
  -- the old columns still hold them.
  insert into public.user_collections (user_id, card_id, bucket, location, quantity, created_at, updated_at)
  select user_id, card_id, 'sale', coalesce(nullif(sale_location, ''), ''), sale_quantity, created_at, now()
  from public.user_collections
  where sale_quantity > 0;

  insert into public.user_collections (user_id, card_id, bucket, location, quantity, loaned_to_user_id, created_at, updated_at)
  select user_id, card_id, 'loaned', coalesce(nullif(loaned_to, ''), 'Unknown borrower'), loaned_quantity,
         loaned_to_user_id, created_at, now()
  from public.user_collections
  where loaned_quantity > 0 and bucket is null;

  -- Everything still unlabelled is the original personal row.
  update public.user_collections
     set bucket = 'personal', location = coalesce(location, '')
   where bucket is null;

  -- A personal row with no copies held nothing but a location string.
  delete from public.user_collections where bucket = 'personal' and quantity <= 0;

  alter table public.user_collections
    drop column sale_quantity,
    drop column sale_location,
    drop column loaned_quantity,
    drop column loaned_to;
end $$;

-- Applied outside the guard so a half-finished earlier attempt still converges.
alter table public.user_collections
  alter column location set default '';
update public.user_collections set location = '' where location is null;
alter table public.user_collections
  alter column location set not null,
  alter column bucket set not null;

alter table public.user_collections
  drop constraint if exists user_collections_bucket_check;
alter table public.user_collections
  add constraint user_collections_bucket_check
  check (bucket in ('personal', 'sale', 'loaned'));

-- A row exists to record copies; zero of them is a row that should be deleted.
alter table public.user_collections
  drop constraint if exists user_collections_quantity_positive;
alter table public.user_collections
  add constraint user_collections_quantity_positive check (quantity > 0);

-- A loan has to say who holds the cards, or it is not actionable. Other buckets
-- may leave the place blank — "somewhere" is a normal answer for a bulk box.
alter table public.user_collections
  drop constraint if exists user_collections_loan_names_borrower;
alter table public.user_collections
  add constraint user_collections_loan_names_borrower
  check (bucket <> 'loaned' or location <> '');

-- Two rows for the same card, bucket and place would be one row with a bigger
-- number. nulls not distinct is unnecessary now that location is not null.
drop index if exists user_collections_user_id_card_id_key;
create unique index if not exists user_collections_place_key
  on public.user_collections (user_id, card_id, bucket, location);

comment on column public.user_collections.bucket is
  'personal | sale | loaned. What these copies are for.';
comment on column public.user_collections.location is
  'Where the copies are, e.g. "Box 2". For bucket = loaned, who holds them. Empty string means unspecified; required for loans.';
comment on column public.user_collections.quantity is
  'Copies at this one place. Always above 0 — delete the row instead.';

-- Replaces the partial indexes keyed on the dropped columns.
drop index if exists user_collections_for_sale_idx;
drop index if exists user_collections_loaned_idx;
create index if not exists user_collections_user_bucket_idx
  on public.user_collections (user_id, bucket);

-- ---------------------------------------------------------------- guest view
--
-- Locations are owner-only. A guest sees how many copies exist in each bucket
-- they were granted, never where those copies are — and never who is holding a
-- loan, since that names a third party who did not agree to be listed.
--
-- Quantities are summed across places, so splitting copies between boxes changes
-- nothing about what a guest sees.
--
-- Dropped first: CREATE OR REPLACE cannot change a function's return type, and
-- this one loses the location columns and gains the card detail columns, so
-- replacing in place fails with "cannot change return type of existing function".
drop function if exists public.shared_collection(text);

create function public.shared_collection(p_token text)
returns table (
  card_id uuid,
  card_name text,
  set_code text,
  set_name text,
  rarity text,
  image_url text,
  card_type text,
  element text,
  cost integer,
  power integer,
  life integer,
  speed text,
  effect_text text,
  personal_quantity integer,
  sale_quantity integer,
  loaned_quantity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    st.code,
    st.name,
    c.rarity,
    c.image_url,
    c.card_type,
    c.element,
    c.cost,
    c.power,
    c.life,
    c.speed,
    c.effect_text,
    coalesce(sum(uc.quantity) filter (where uc.bucket = 'personal' and s.include_personal), 0)::integer,
    coalesce(sum(uc.quantity) filter (where uc.bucket = 'sale'     and s.include_sale),     0)::integer,
    coalesce(sum(uc.quantity) filter (where uc.bucket = 'loaned'   and s.include_loaned),   0)::integer
  from public.resolve_collection_share(p_token) s
  join public.user_collections uc on uc.user_id = s.owner_id
  join public.cards c on c.id = uc.card_id
  left join public.sets st on st.id = c.set_id
  where (s.include_personal and uc.bucket = 'personal')
     or (s.include_sale     and uc.bucket = 'sale')
     or (s.include_loaned   and uc.bucket = 'loaned')
  group by c.id, c.name, st.code, st.name, c.rarity, c.image_url, c.card_type,
           c.element, c.cost, c.power, c.life, c.speed, c.effect_text
  having coalesce(sum(uc.quantity), 0) > 0
  order by c.name, st.name;
$$;

grant execute on function public.shared_collection(text) to anon, authenticated;
