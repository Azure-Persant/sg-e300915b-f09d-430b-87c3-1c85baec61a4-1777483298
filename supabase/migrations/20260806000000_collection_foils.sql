-- Foils.
--
-- Foil is a property of the copy someone owns, not of a printing, and the API
-- models it the same way: an edition carries circulationTemplates with
-- kind 'NONFOIL' / foil false and separate foil populations, rather than existing
-- as a second edition. So it belongs on the holding. Syncing foils as extra rows
-- in cards would roughly double the catalog and break cards_printing_key.

alter table public.user_collections
  add column if not exists foil boolean not null default false;

-- The place key has to include it. Without that, one box holding both a foil and
-- a non-foil copy of the same card in the same bucket is unrepresentable — the
-- second one collides with the first.
drop index if exists public.user_collections_place_key;
create unique index if not exists user_collections_place_key
  on public.user_collections (user_id, card_id, bucket, location, foil);

comment on column public.user_collections.foil is
  'Whether these copies are foil. Part of the place key, so foil and non-foil copies of one card can sit in the same box.';

-- Existing rows default to false, which is the right reading of a collection
-- recorded before foils could be told apart.
create index if not exists user_collections_foil_idx
  on public.user_collections (user_id, foil)
  where foil;

-- The guest view sums quantities per bucket and never mentioned places, so it
-- needs no change: a foil and a non-foil copy simply add up, which is what a
-- visitor reading "3 for sale" should see.
