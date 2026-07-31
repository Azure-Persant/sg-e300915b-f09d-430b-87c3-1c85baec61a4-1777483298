-- Which printing represents a card on the collection page.
--
-- The collection groups holdings by card name and shows one piece of art per
-- name. Until now that was whichever holding came back from Postgres first,
-- which is stable but arbitrary — someone owning a card in three sets had no say
-- in which one they saw.
--
-- Keyed by name rather than by card id because the choice is about the group, and
-- the group is a name. It cannot live on user_collections: one name can have
-- several rows there (a printing per place, per bucket), so a flag on that table
-- could contradict itself and nothing there knows the name to constrain against.

create table if not exists public.collection_previews (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_name text not null,
  card_id uuid not null references public.cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_name)
);

comment on table public.collection_previews is
  'Per-user choice of which printing represents a card name on the collection page. Absent means fall back to the first holding.';
comment on column public.collection_previews.card_name is
  'The grouped name, matching cards.name. The group key, not a foreign key.';
comment on column public.collection_previews.card_id is
  'The chosen printing. Not constrained to a card the user owns — the collection page ignores a choice whose copies have all gone, which keeps giving up a card from silently deleting rows.';

alter table public.collection_previews enable row level security;

-- create policy has no IF NOT EXISTS, so drop first to stay re-runnable.
drop policy if exists collection_previews_select_own on public.collection_previews;
drop policy if exists collection_previews_insert_own on public.collection_previews;
drop policy if exists collection_previews_update_own on public.collection_previews;
drop policy if exists collection_previews_delete_own on public.collection_previews;

create policy collection_previews_select_own on public.collection_previews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy collection_previews_insert_own on public.collection_previews
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy collection_previews_update_own on public.collection_previews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy collection_previews_delete_own on public.collection_previews
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No guest policy on purpose. A shared collection is served by
-- shared_collection(), which picks its own art; letting a token holder read this
-- table would expose which names a stranger has.

-- Supabase's default privileges would cover this, but the baseline grants each
-- table explicitly, and being explicit means the policies above are what decides
-- access rather than a project-level default. anon is deliberately omitted.
grant select, insert, update, delete on public.collection_previews to authenticated;

drop trigger if exists collection_previews_set_updated_at on public.collection_previews;
create trigger collection_previews_set_updated_at
  before update on public.collection_previews
  for each row execute function public.set_updated_at();
