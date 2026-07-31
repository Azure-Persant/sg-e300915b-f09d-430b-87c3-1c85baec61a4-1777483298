-- Foil copies in a deck.
--
-- A deck row already names a printing; this says which finish of it the deck
-- intends to use. It has to be stored rather than inferred from the collection:
-- someone holding one foil and three plain copies of a card gives no answer to
-- "is this deck's playset foil", and a deck is a plan, so it may call for a foil
-- that has not been bought yet.
--
-- Like the collection's place key, the row identity has to widen with it, so a
-- deck can hold three plain copies and one foil copy of the same card in the same
-- section as two rows.

alter table public.deck_cards
  add column if not exists foil boolean not null default false;

-- Created as a unique index in 20260804000000, so it is dropped as one.
drop index if exists public.deck_cards_deck_card_section_key;
create unique index if not exists deck_cards_deck_card_section_key
  on public.deck_cards (deck_id, card_id, section, foil);

comment on column public.deck_cards.foil is
  'Whether this deck intends foil copies of the printing. Part of the row identity, so plain and foil copies of one card can both appear in a section.';

-- Existing rows default to false, which is what a deck recorded before finishes
-- could be told apart was implicitly asking for.
