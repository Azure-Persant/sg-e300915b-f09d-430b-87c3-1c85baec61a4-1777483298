-- Public decks, shared decks, and the Deck Showcase.
--
-- Three states, built from two mechanisms rather than three:
--   private — the default; only the owner can read it
--   shared  — private, plus one or more unguessable links, each optionally tied
--             to an email address and optionally expiring
--   public  — listed on the Showcase and readable by anyone, signed in or not
--
-- Sharing mirrors collection_shares deliberately, down to the token shape and
-- the resolve-then-read split, so there is one pattern to understand rather than
-- two. The difference is what RLS can safely do. A collection share had to go
-- through security definer functions because a select policy on user_collections
-- would have leaked quantities and locations the share did not include. A deck
-- has no such per-row secrets — either you may see the deck or you may not — so
-- public decks are handled by RLS, and only token access needs functions.

-- ------------------------------------------------------------ public reading

-- The policies for this already existed in the baseline; the privileges did not,
-- so anonymous visitors were refused before any policy was consulted. Both
-- policies restrict anon to is_public decks, so this grants nothing wider.
grant select on public.decks to anon;
grant select on public.deck_cards to anon;

-- ----------------------------------------------------------------- deck links

create table if not exists public.deck_shares (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,

  -- Same construction as collection_shares: two random uuids with the hyphens
  -- stripped, so 64 hex characters and roughly 244 bits. gen_random_uuid rather
  -- than pgcrypto's gen_random_bytes, which is not on Supabase's default
  -- search_path.
  token text not null unique default
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),

  -- The owner's own name for the link, e.g. "For the playgroup".
  label text,

  -- Null means an open link: the token is the only credential. Set means the
  -- viewer must be signed in with that address.
  invited_email text,

  -- Null means it never expires. The owner chooses.
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),

  constraint deck_shares_email_lowercase
    check (invited_email is null or invited_email = lower(invited_email)),

  -- One invite per address per deck; re-inviting updates rather than stacks.
  -- Open links are all null here, and Postgres treats nulls as distinct, so a
  -- deck can have as many of those as the owner likes.
  unique (deck_id, invited_email)
);

comment on table public.deck_shares is
  'Links granting read access to one deck. An invited_email additionally requires the viewer to be signed in as that address.';

create index if not exists deck_shares_deck_id_idx on public.deck_shares (deck_id);

alter table public.deck_shares enable row level security;

drop policy if exists deck_shares_select_own on public.deck_shares;
drop policy if exists deck_shares_insert_own on public.deck_shares;
drop policy if exists deck_shares_update_own on public.deck_shares;
drop policy if exists deck_shares_delete_own on public.deck_shares;

-- Ownership is the deck's, not the row's, so every policy asks the same question.
create policy deck_shares_select_own on public.deck_shares
  for select to authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = deck_shares.deck_id and d.user_id = (select auth.uid())
  ));

create policy deck_shares_insert_own on public.deck_shares
  for insert to authenticated
  with check (exists (
    select 1 from public.decks d
    where d.id = deck_shares.deck_id and d.user_id = (select auth.uid())
  ));

create policy deck_shares_update_own on public.deck_shares
  for update to authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = deck_shares.deck_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.decks d
    where d.id = deck_shares.deck_id and d.user_id = (select auth.uid())
  ));

create policy deck_shares_delete_own on public.deck_shares
  for delete to authenticated
  using (exists (
    select 1 from public.decks d
    where d.id = deck_shares.deck_id and d.user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.deck_shares to authenticated;

-- ---------------------------------------------------------------- resolution

/**
 * Resolve a token to a usable share, or nothing.
 *
 * Unknown, revoked, expired and wrong-address all return no row, so a visitor
 * cannot tell them apart. current_email() is shared with the collection shares.
 */
create or replace function public.resolve_deck_share(p_token text)
returns public.deck_shares
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.deck_shares s
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and (s.invited_email is null or s.invited_email = public.current_email())
  limit 1;
$$;

grant execute on function public.resolve_deck_share(text) to anon, authenticated;

/**
 * A display name that is safe to show a stranger.
 *
 * Same rule as the shared collection header: a real name if one is set, and a
 * neutral label otherwise. Never the email address, or any part of it.
 */
create or replace function public.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(p.full_name), ''), 'A collector')
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.display_name_of(uuid) to anon, authenticated;

/** Header information for a deck opened by link. */
create or replace function public.shared_deck_meta(p_token text)
returns table (
  deck_id uuid,
  name text,
  description text,
  owner_name text,
  label text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.name,
    d.description,
    public.display_name_of(d.user_id),
    s.label,
    s.expires_at
  from public.resolve_deck_share(p_token) s
  join public.decks d on d.id = s.deck_id;
$$;

grant execute on function public.shared_deck_meta(text) to anon, authenticated;

/**
 * The cards of a deck opened by link.
 *
 * Returns the columns the deck view renders and nothing else. No row comes back
 * for a token that does not resolve, so the check lives in one place.
 */
create or replace function public.shared_deck_cards(p_token text)
returns table (
  card_id uuid,
  section text,
  quantity integer,
  foil boolean,
  name text,
  element text,
  types text[],
  cost_memory integer,
  cost_reserve integer,
  is_restricted boolean,
  image_url text,
  effect_text text,
  set_code text,
  set_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dc.card_id,
    dc.section,
    dc.quantity,
    dc.foil,
    c.name,
    c.element,
    c.types,
    c.cost_memory,
    c.cost_reserve,
    c.is_restricted,
    c.image_url,
    c.effect_text,
    st.code,
    st.name
  from public.resolve_deck_share(p_token) s
  join public.deck_cards dc on dc.deck_id = s.deck_id
  join public.cards c on c.id = dc.card_id
  left join public.sets st on st.id = c.set_id;
$$;

grant execute on function public.shared_deck_cards(text) to anon, authenticated;

-- ------------------------------------------------------------------ showcase

/**
 * Public decks, with what the Showcase filters and sorts on.
 *
 * security_invoker so the caller's own permissions decide what is visible: the
 * baseline's is_public policies already restrict both anon and other signed-in
 * people to public decks, and this view must not become a way around them. The
 * owner's name comes from a security definer function because profiles is
 * readable only by its owner, and a name is the one thing about them a visitor
 * is meant to see.
 */
create or replace view public.deck_showcase
with (security_invoker = true) as
select
  d.id,
  d.name,
  d.description,
  d.user_id,
  d.created_at,
  d.updated_at,
  public.display_name_of(d.user_id) as owner_name,
  cover.image_url as cover_image_url,
  cover.name as cover_name,
  stats.card_count,
  stats.elements,
  stats.champions,
  stats.top_champion
from public.decks d
left join public.cards cover on cover.id = d.cover_card_id
left join lateral (
  select
    coalesce(sum(dc.quantity), 0)::integer as card_count,
    -- Elements the deck actually plays, for the element filter. Norm is dropped:
    -- almost every deck has it, so it separates nothing.
    coalesce(
      array_agg(distinct c.element) filter (where c.element is not null and c.element <> 'NORM'),
      '{}'::text[]
    ) as elements,
    coalesce(
      array_agg(distinct c.name) filter (where 'CHAMPION' = any(c.types)),
      '{}'::text[]
    ) as champions,
    -- The headline champion: the highest level in the deck, which is the one a
    -- deck is known by. Level is the memory cost — see deckOrder.ts.
    (
      select c2.name
      from public.deck_cards dc2
      join public.cards c2 on c2.id = dc2.card_id
      where dc2.deck_id = d.id and 'CHAMPION' = any(c2.types)
      order by c2.cost_memory desc nulls last, c2.name
      limit 1
    ) as top_champion
  from public.deck_cards dc
  join public.cards c on c.id = dc.card_id
  where dc.deck_id = d.id
) stats on true
where d.is_public;

comment on view public.deck_showcase is
  'Public decks with their champions, elements and card count, for the Showcase listing.';

grant select on public.deck_showcase to anon, authenticated;

-- ----------------------------------------------------------------- duplicate

/**
 * Copy a deck into the caller's account.
 *
 * Security definer because the source may be a deck the caller can read only
 * through a token, which RLS cannot see. The permission check is therefore
 * explicit and covers all three ways a deck can be readable: it is yours, it is
 * public, or the token resolves to it.
 *
 * The copy is always private, whatever the original was. Making something public
 * should be a decision, not something inherited by pressing Duplicate.
 */
create or replace function public.duplicate_deck(p_deck_id uuid, p_token text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_allowed boolean;
  v_name text;
  v_new_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to copy a deck';
  end if;

  select
    d.user_id = v_user
      or d.is_public
      or exists (select 1 from public.resolve_deck_share(p_token) s where s.deck_id = d.id),
    d.name
  into v_allowed, v_name
  from public.decks d
  where d.id = p_deck_id;

  if not coalesce(v_allowed, false) then
    raise exception 'That deck is not available to copy';
  end if;

  insert into public.decks (user_id, name, description, cover_card_id, is_public)
  select v_user, v_name || ' (copy)', d.description, d.cover_card_id, false
  from public.decks d
  where d.id = p_deck_id
  returning id into v_new_id;

  insert into public.deck_cards (deck_id, card_id, quantity, section, foil)
  select v_new_id, dc.card_id, dc.quantity, dc.section, dc.foil
  from public.deck_cards dc
  where dc.deck_id = p_deck_id;

  return v_new_id;
end;
$$;

grant execute on function public.duplicate_deck(uuid, text) to authenticated;
