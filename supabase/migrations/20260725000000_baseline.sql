-- Grand Archive Inventory baseline schema.
-- This migration is the authoritative starting point for new Supabase projects.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  release_date date,
  total_cards integer check (total_cards is null or total_cards >= 0),
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.sets(id) on delete cascade,
  name text not null,
  card_number text not null,
  element text,
  card_type text not null,
  class text,
  rarity text not null,
  cost integer,
  power integer,
  life integer,
  speed integer,
  effect_text text,
  flavor_text text,
  image_url text,
  illustrator text,
  is_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cards_printing_key unique nulls not distinct
    (set_id, card_number, rarity, image_url)
);

create table public.card_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 0),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, card_id)
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  unique (deck_id, card_id)
);

create table public.sync_history (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_cards_processed integer not null default 0 check (total_cards_processed >= 0),
  total_sets_processed integer not null default 0 check (total_sets_processed >= 0),
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index cards_set_id_idx on public.cards(set_id);
create index cards_name_idx on public.cards(name);
create index cards_rarity_idx on public.cards(rarity);
create index cards_element_idx on public.cards(element);
create index cards_card_type_idx on public.cards(card_type);
create index card_locations_user_id_idx on public.card_locations(user_id);
create index user_collections_user_id_idx on public.user_collections(user_id);
create index user_collections_card_id_idx on public.user_collections(card_id);
create index decks_user_id_idx on public.decks(user_id);
create index deck_cards_deck_id_idx on public.deck_cards(deck_id);
create index deck_cards_card_id_idx on public.deck_cards(card_id);
create index sync_history_created_at_idx on public.sync_history(created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_collections_set_updated_at
  before update on public.user_collections
  for each row execute function public.set_updated_at();

create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_locations enable row level security;
alter table public.user_collections enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.sync_history enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy sets_read_public on public.sets
  for select to anon, authenticated using (true);
create policy cards_read_public on public.cards
  for select to anon, authenticated using (true);

create policy card_locations_select_own on public.card_locations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy card_locations_insert_own on public.card_locations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy card_locations_update_own on public.card_locations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy card_locations_delete_own on public.card_locations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_collections_select_own on public.user_collections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_collections_insert_own on public.user_collections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_collections_update_own on public.user_collections
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_collections_delete_own on public.user_collections
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy decks_select_own_or_public on public.decks
  for select to authenticated
  using ((select auth.uid()) = user_id or is_public);
create policy decks_select_public_anon on public.decks
  for select to anon using (is_public);
create policy decks_insert_own on public.decks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy decks_update_own on public.decks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy decks_delete_own on public.decks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy deck_cards_select_visible_deck on public.deck_cards
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.decks
      where decks.id = deck_cards.deck_id
        and (decks.is_public or decks.user_id = (select auth.uid()))
    )
  );
create policy deck_cards_insert_own_deck on public.deck_cards
  for insert to authenticated
  with check (
    exists (
      select 1 from public.decks
      where decks.id = deck_cards.deck_id
        and decks.user_id = (select auth.uid())
    )
  );
create policy deck_cards_update_own_deck on public.deck_cards
  for update to authenticated
  using (
    exists (
      select 1 from public.decks
      where decks.id = deck_cards.deck_id
        and decks.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decks
      where decks.id = deck_cards.deck_id
        and decks.user_id = (select auth.uid())
    )
  );
create policy deck_cards_delete_own_deck on public.deck_cards
  for delete to authenticated
  using (
    exists (
      select 1 from public.decks
      where decks.id = deck_cards.deck_id
        and decks.user_id = (select auth.uid())
    )
  );

create policy sync_history_read_public on public.sync_history
  for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.sets, public.cards, public.sync_history to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.card_locations to authenticated;
grant select, insert, update, delete on public.user_collections to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.deck_cards to authenticated;

-- Catalog and sync-history writes intentionally have no anon/authenticated policy.
-- Server-side synchronization uses the service-role key, which bypasses RLS.
