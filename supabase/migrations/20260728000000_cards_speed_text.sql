-- cards.speed: integer -> text
--
-- `card.speed` in the Grand Archive API payload is a BOOLEAN, not a number:
-- true = Fast, false = Slow, and only 1,578 of the 4,504 printings carry a
-- value at all. The baseline declared the column as integer, so the very first
-- card batch of every sync was rejected by Postgres with
--
--   invalid input syntax for type integer: "false" (22P02)
--
-- and that happened only after the fetch loop had already walked all 151 API
-- pages, so the catalog stayed at 0 rows. Store the label as text so the value
-- round-trips to the UI as "Fast"/"Slow".
--
-- Guarded so it is safe to re-run. A bare `alter column ... using` is NOT
-- idempotent: the USING expression is typechecked against the column's current
-- type, so once speed is text a second run fails with
--
--   operator does not exist: text = integer
--
-- The ALTER is wrapped in EXECUTE rather than written inline, so its body is
-- parsed only if the branch is actually taken.
--
-- The cast compares on ::text so it converts correctly from either possible
-- prior state: integer 0 or boolean false both become 'Slow'.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cards'
      and column_name = 'speed'
      and data_type <> 'text'
  ) then
    execute $mig$
      alter table public.cards
        alter column speed type text
        using case
          when speed is null then null
          when speed::text in ('0', 'false', 'f') then 'Slow'
          else 'Fast'
        end
    $mig$;
  end if;
end $$;

comment on column public.cards.speed is
  'Fast or Slow. Derived from the boolean card.speed field in the gatcg.com API.';
