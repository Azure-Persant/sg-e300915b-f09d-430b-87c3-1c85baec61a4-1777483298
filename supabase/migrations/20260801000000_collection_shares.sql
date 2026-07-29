-- Sharing a collection with chosen people.
--
-- Every share is reached by an unguessable token in the URL. A share may also
-- name an invited email, in which case the token alone is not enough: the viewer
-- must be signed in with that address. So one URL shape serves both modes —
-- an open link, or a link that only works for one person.
--
-- Which buckets a viewer sees is entirely the owner's choice, including personal
-- holdings on an open link. Nothing is withheld beyond what the owner set.
--
-- Access is deliberately NOT granted through RLS on user_collections. A select
-- policy there would expose whole rows, so a for-sale-only share would still
-- leak the personal quantity and location to anyone who queried the table
-- directly. Instead the base table stays owner-only and readers go through
-- security definer functions that return just the permitted columns.

create table if not exists public.collection_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  -- The URL. Two random uuids, hyphens stripped: 64 hex characters and ~244
  -- bits of entropy, so the token space is not enumerable. Built from
  -- gen_random_uuid rather than pgcrypto's gen_random_bytes, which is not in the
  -- default search_path on Supabase and would make this migration depend on
  -- where that extension happens to be installed.
  token text not null unique default
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),

  -- Owner's own name for the share, e.g. "Sale list", "Playgroup".
  label text,

  -- Null means an open link: the token is the only credential. Set means the
  -- viewer must be signed in with this address, and access is revocable per
  -- person by deleting the row.
  invited_email text,

  include_personal boolean not null default false,
  include_sale     boolean not null default true,
  include_loaned   boolean not null default false,

  -- Null means no expiry. The owner picks; nothing is forced.
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),

  -- A share showing nothing is a dead link, not a private one.
  constraint collection_shares_has_a_bucket
    check (include_personal or include_sale or include_loaned),

  -- Stored lowercased so the comparison against the JWT email is exact.
  constraint collection_shares_email_lowercase
    check (invited_email is null or invited_email = lower(invited_email)),

  -- One invite per address per owner; re-inviting updates rather than stacks.
  unique (owner_id, invited_email)
);

comment on table public.collection_shares is
  'Grants of read access to a collection. Reached by token; an invited_email additionally requires the viewer to be signed in as that address.';
comment on column public.collection_shares.invited_email is
  'Null for an open link. Set to restrict the token to one signed-in address.';
comment on column public.collection_shares.expires_at is
  'Null for no expiry. Owner chooses.';

create index if not exists collection_shares_owner_idx
  on public.collection_shares (owner_id);
create index if not exists collection_shares_email_idx
  on public.collection_shares (invited_email)
  where invited_email is not null;

alter table public.collection_shares enable row level security;

-- Owners manage their own shares. Viewers never read this table directly; they
-- reach a collection through the functions below.
--
-- Dropped first because CREATE POLICY has no IF NOT EXISTS, so without this the
-- migration cannot be re-run.
drop policy if exists collection_shares_select_own on public.collection_shares;
drop policy if exists collection_shares_insert_own on public.collection_shares;
drop policy if exists collection_shares_update_own on public.collection_shares;
drop policy if exists collection_shares_delete_own on public.collection_shares;

create policy collection_shares_select_own on public.collection_shares
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy collection_shares_insert_own on public.collection_shares
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy collection_shares_update_own on public.collection_shares
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy collection_shares_delete_own on public.collection_shares
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------- resolution

/**
 * The signed-in viewer's email, lowercased, or null when unauthenticated.
 * Kept as one function so both resolvers agree on how the address is read.
 */
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''));
$$;

/**
 * Resolve a token to a usable share, or nothing.
 *
 * Returns no row when the token is unknown, revoked, expired, or restricted to
 * an address the caller is not signed in as. Callers therefore cannot tell those
 * cases apart, which is the point: a wrong token and a revoked token look alike.
 */
create or replace function public.resolve_collection_share(p_token text)
returns public.collection_shares
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.collection_shares s
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and (s.invited_email is null or s.invited_email = public.current_email())
  limit 1;
$$;

/** Header information for a shared collection page. */
create or replace function public.shared_collection_meta(p_token text)
returns table (
  owner_name text,
  label text,
  include_personal boolean,
  include_sale boolean,
  include_loaned boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.full_name, split_part(coalesce(p.email, ''), '@', 1), 'A collector'),
    s.label,
    s.include_personal,
    s.include_sale,
    s.include_loaned,
    s.expires_at
  from public.resolve_collection_share(p_token) s
  join public.profiles p on p.id = s.owner_id;
$$;

/**
 * The shared holdings themselves.
 *
 * Buckets the share does not include come back as 0 and null rather than being
 * omitted, so the caller needs no knowledge of the flags to render safely. A row
 * appears only if it has copies in a bucket the viewer is allowed to see, which
 * keeps a sale-only share from advertising the existence of personal-only cards.
 */
create or replace function public.shared_collection(p_token text)
returns table (
  card_id uuid,
  card_name text,
  set_code text,
  set_name text,
  rarity text,
  image_url text,
  personal_quantity integer,
  personal_location text,
  sale_quantity integer,
  sale_location text,
  loaned_quantity integer,
  loaned_to text
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
    case when s.include_personal then uc.quantity else 0 end,
    case when s.include_personal then uc.location else null end,
    case when s.include_sale then uc.sale_quantity else 0 end,
    case when s.include_sale then uc.sale_location else null end,
    case when s.include_loaned then uc.loaned_quantity else 0 end,
    case when s.include_loaned then uc.loaned_to else null end
  from public.resolve_collection_share(p_token) s
  join public.user_collections uc on uc.user_id = s.owner_id
  join public.cards c on c.id = uc.card_id
  left join public.sets st on st.id = c.set_id
  where (s.include_personal and uc.quantity > 0)
     or (s.include_sale and uc.sale_quantity > 0)
     or (s.include_loaned and uc.loaned_quantity > 0)
  order by c.name, st.name;
$$;

-- anon as well as authenticated: an open link should work for someone without
-- an account. resolve_collection_share still enforces the email restriction when
-- one is set, so granting anon here does not widen access.
grant execute on function public.current_email() to anon, authenticated;
grant execute on function public.resolve_collection_share(text) to anon, authenticated;
grant execute on function public.shared_collection_meta(text) to anon, authenticated;
grant execute on function public.shared_collection(text) to anon, authenticated;
