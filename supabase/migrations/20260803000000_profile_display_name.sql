-- Stop showing a guest the owner's email address.
--
-- shared_collection_meta fell back to the local part of the email when no name
-- was set, so a shared link displayed "jonc's collection" — a fragment of a
-- private address shown to whoever holds the link. It now falls back to a
-- neutral label, and the profile page lets people set a real display name.
--
-- The signup trigger already reads raw_user_meta_data ->> 'full_name', which is
-- both what the signup form now sends and what Google returns for an OAuth
-- sign-in, so no trigger change is needed.

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
    -- No email fallback: an address, or part of one, is not ours to show.
    coalesce(nullif(trim(p.full_name), ''), 'A collector'),
    s.label,
    s.include_personal,
    s.include_sale,
    s.include_loaned,
    s.expires_at
  from public.resolve_collection_share(p_token) s
  join public.profiles p on p.id = s.owner_id;
$$;

grant execute on function public.shared_collection_meta(text) to anon, authenticated;

comment on column public.profiles.full_name is
  'Display name, shown to anyone the collection is shared with. Set at signup, or supplied by the OAuth provider, and editable on the profile page.';

-- profiles already has profiles_select_own and profiles_update_own, which is all
-- the profile page needs: a signed-in person reading and writing their own row.
