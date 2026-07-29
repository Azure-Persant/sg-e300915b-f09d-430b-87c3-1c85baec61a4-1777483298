-- Filterable card fields for the /cards filter bar.
--
-- The sync flattened several multi-valued API fields into display strings, so
-- none of them could be filtered:
--   card_type  "REGALIA ITEM — WARRIOR RING"  <- types + subtypes, joined
--   class      "WARRIOR, MAGE"                <- classes, joined
--   cost       3                              <- cost_reserve ?? cost_memory
--
-- The display columns stay as they are (the UI renders them); these add the
-- structured values alongside. Rows keep NULL/{} until the next sync runs.
--
-- On costs: no card in the catalog carries both cost_memory and cost_reserve —
-- 473 are memory-only, 1,762 reserve-only, 5 neither — so the old single `cost`
-- column was not losing a second value, only which kind it was. Both ranges
-- include -1, which the API uses for an X cost.
--
-- element is deliberately NOT an array: no card has more than one.

alter table public.cards
  add column if not exists cost_memory  integer,
  add column if not exists cost_reserve integer,
  add column if not exists types        text[] not null default '{}',
  add column if not exists subtypes     text[] not null default '{}',
  add column if not exists classes      text[] not null default '{}';

comment on column public.cards.types is
  'Card types, e.g. {ACTION} or {REGALIA,ITEM}. Structured form of card_type.';
comment on column public.cards.subtypes is
  'Card subtypes, e.g. {SPELL,REACTION}. 138 distinct values. Excludes the classes a card declares, which the API also echoes into its subtypes array (a Cleric Spell arrives as [CLERIC,SPELL]); those stay in classes and in the card_type display string. Compared per card, not by name: SPIRIT is a class on 38 cards and a genuine subtype on 4 others.';
comment on column public.cards.classes is
  'Card classes, e.g. {WARRIOR}. Structured form of the class column.';

-- Substring search over effect text. ILIKE '%...%' cannot use a btree index, so
-- without pg_trgm every effect search is a full scan of 4,504 rows.
create extension if not exists pg_trgm;

create index if not exists cards_effect_text_trgm_idx
  on public.cards using gin (effect_text gin_trgm_ops);
create index if not exists cards_name_trgm_idx
  on public.cards using gin (name gin_trgm_ops);

create index if not exists cards_types_idx    on public.cards using gin (types);
create index if not exists cards_subtypes_idx on public.cards using gin (subtypes);
create index if not exists cards_classes_idx  on public.cards using gin (classes);
create index if not exists cards_element_idx  on public.cards (element);
create index if not exists cards_cost_memory_idx  on public.cards (cost_memory);
create index if not exists cards_cost_reserve_idx on public.cards (cost_reserve);

-- Rebuilt to carry the filterable columns, plus set_codes: every set the card
-- appears in, so filtering by set means "cards available in this set" while the
-- tile still shows the best-ranked printing's art. array_agg(distinct ...) is
-- not allowed as a window function, hence the CTE.
--
-- Dropped and recreated rather than CREATE OR REPLACE: that form may only append
-- columns at the end of an existing view, and this inserts types/subtypes/
-- classes mid-list, which Postgres rejects with
--   cannot change name of view column "rarity" to "types" (42P16)
-- The drop is deliberately not CASCADE, so if anything ever does depend on this
-- view the migration fails loudly instead of quietly removing it. Grants are
-- reapplied below, in the same transaction.
drop view if exists public.card_catalog;

create view public.card_catalog
with (security_invoker = true) as
with per_name as (
  select
    c.name,
    count(*) as printing_count,
    array_remove(array_agg(distinct s.code), null) as set_codes
  from public.cards c
  left join public.sets s on s.id = c.set_id
  group by c.name
)
select distinct on (c.name)
  c.id,
  c.name,
  c.set_id,
  c.card_number,
  c.element,
  c.card_type,
  c.class,
  c.types,
  c.subtypes,
  c.classes,
  c.rarity,
  c.cost,
  c.cost_memory,
  c.cost_reserve,
  c.power,
  c.life,
  c.speed,
  c.effect_text,
  c.image_url,
  c.illustrator,
  c.is_restricted,
  s.code as set_code,
  s.name as set_name,
  s.rank as set_rank,
  pn.printing_count,
  pn.set_codes
from public.cards c
left join public.sets s on s.id = c.set_id
join per_name pn on pn.name = c.name
order by
  c.name,
  (c.image_url is null),
  s.rank nulls last,
  s.name nulls last,
  c.card_number;

comment on view public.card_catalog is
  'One row per card name — the printing that best represents it (base expansion over variant over promo, alphabetical within a tier). set_codes lists every set the card appears in. Use for grid/browse; query public.cards directly for a specific printing.';

grant select on public.card_catalog to anon, authenticated;

-- Distinct filter values with counts, so the filter bar can populate every
-- dropdown from one request instead of scanning the catalog in the browser.
-- Dropped first for the same reason as above, so a later change to its shape
-- does not hit the same 42P16 error.
drop view if exists public.card_filter_options;

create view public.card_filter_options
with (security_invoker = true) as
-- count(distinct name), not count(*): a card with three printings is still one
-- card, and "WIND (2)" for a single card would misread as two.
select 'element' as kind, c.element as value, count(distinct c.name) as card_count
  from public.cards c
 where c.element is not null and c.element <> ''
 group by c.element
union all
select 'type', t, count(distinct c.name)
  from public.cards c, unnest(c.types) as t
 group by t
union all
select 'subtype', s, count(distinct c.name)
  from public.cards c, unnest(c.subtypes) as s
 group by s
union all
select 'class', k, count(distinct c.name)
  from public.cards c, unnest(c.classes) as k
 group by k;

comment on view public.card_filter_options is
  'Distinct element/type/subtype/class values with card counts, for populating the /cards filter controls.';

grant select on public.card_filter_options to anon, authenticated;
