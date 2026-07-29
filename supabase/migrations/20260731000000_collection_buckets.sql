-- Personal, for-sale, and loaned-out holdings in user_collections.
--
-- A card can be held three ways at once: kept for play, stocked for sale or
-- trade, and lent to someone. Those are different numbers in different places,
-- so each gets its own quantity.
--
-- quantity and location keep their names and meaning (personal), so every
-- existing row stays correct and nothing that already reads them breaks. The new
-- quantities default to 0, which is the truthful starting value.
--
-- Kept as one row per card rather than a row per bucket, so the unique
-- constraint on (user_id, card_id) still holds, upserts still target it, and the
-- edit dialog stays fixed fields instead of a row editor.

alter table public.user_collections
  add column if not exists sale_quantity integer not null default 0
    check (sale_quantity >= 0),
  add column if not exists sale_location text,
  add column if not exists loaned_quantity integer not null default 0
    check (loaned_quantity >= 0),
  add column if not exists loaned_to text,
  add column if not exists loaned_to_user_id uuid
    references public.profiles(id) on delete set null;

comment on column public.user_collections.quantity is
  'Copies kept for personal use.';
comment on column public.user_collections.location is
  'Where the personal copies are kept, e.g. "Binder A". Free text.';
comment on column public.user_collections.sale_quantity is
  'Copies available for sale or trade. Counted separately from quantity.';
comment on column public.user_collections.sale_location is
  'Where the for-sale copies are kept, e.g. "Trade box". Free text.';
comment on column public.user_collections.loaned_quantity is
  'Copies currently lent out. Counted separately from quantity.';
comment on column public.user_collections.loaned_to is
  'Who holds the loaned copies. Always set when loaned_quantity > 0, even if loaned_to_user_id is also set, so the borrower stays named if their account is removed.';
comment on column public.user_collections.loaned_to_user_id is
  'The borrower, when they have an account here. Nullable: lending to someone without an account is the common case, and ON DELETE SET NULL keeps the row and the loaned_to name if the account goes away.';

-- A loan with no borrower recorded is not actionable — the whole point is
-- knowing who to ask. Enforced rather than left to the UI because a row that
-- fails this is unrecoverable information.
alter table public.user_collections
  drop constraint if exists user_collections_loan_has_borrower;
alter table public.user_collections
  add constraint user_collections_loan_has_borrower
  check (loaned_quantity = 0 or (loaned_to is not null and loaned_to <> ''));

-- Supports "what is for sale" and "what is lent out" without scanning a whole
-- collection, and both stay small because most rows have 0 in these buckets.
create index if not exists user_collections_for_sale_idx
  on public.user_collections (user_id)
  where sale_quantity > 0;

create index if not exists user_collections_loaned_idx
  on public.user_collections (user_id)
  where loaned_quantity > 0;

-- "Who has my cards" from the borrower's side, once they have an account.
create index if not exists user_collections_loaned_to_user_idx
  on public.user_collections (loaned_to_user_id)
  where loaned_to_user_id is not null;

-- Deck building needs "do I own enough of this printing" per card.
create index if not exists user_collections_card_idx
  on public.user_collections (card_id);
