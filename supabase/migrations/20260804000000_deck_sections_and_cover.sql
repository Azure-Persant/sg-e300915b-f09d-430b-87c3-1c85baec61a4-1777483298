-- Deck sections and cover art.
--
-- A Grand Archive deck is three lists, not one: the material deck (champions,
-- regalia and the cards you start with access to), the main deck, and a
-- sideboard. deck_cards stored a single flat list, so pasting a real deck list
-- lost that structure entirely, and a card played in both the main deck and the
-- sideboard could only be recorded once.
--
-- The section lives on deck_cards rather than in three tables because every
-- other column is identical and every query wants all three lists together.

alter table public.deck_cards
  add column if not exists section text not null default 'main';

-- add constraint has no IF NOT EXISTS, so guard it by name to keep this file
-- re-runnable.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.deck_cards'::regclass
      and conname = 'deck_cards_section_check'
  ) then
    alter table public.deck_cards
      add constraint deck_cards_section_check
      check (section in ('material', 'main', 'sideboard'));
  end if;
end $$;

-- The baseline key was (deck_id, card_id), which makes "4 in the main deck and
-- 2 in the sideboard" unrepresentable. It was declared as an unnamed unique
-- constraint, so Postgres named it deck_cards_deck_id_card_id_key.
alter table public.deck_cards
  drop constraint if exists deck_cards_deck_id_card_id_key;

-- A unique index rather than a constraint, because this one takes IF NOT
-- EXISTS. PostgREST upserts can target it by column list either way.
create unique index if not exists deck_cards_deck_card_section_key
  on public.deck_cards (deck_id, card_id, section);

create index if not exists deck_cards_deck_section_idx
  on public.deck_cards (deck_id, section);

-- Which printing's art represents the deck on the deck list. A printing rather
-- than a name, because the whole point is choosing between the arts of one
-- card. Set null rather than cascade if that printing ever leaves the catalog:
-- losing the chosen art must not delete the deck.
alter table public.decks
  add column if not exists cover_card_id uuid
  references public.cards(id) on delete set null;

-- Existing rows keep section 'main', which is where an unsectioned list would
-- have been read anyway. Nothing here rewrites data.
