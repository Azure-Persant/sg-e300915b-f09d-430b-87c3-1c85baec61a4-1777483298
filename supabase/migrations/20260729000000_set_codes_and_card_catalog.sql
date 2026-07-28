-- Fix set codes, rank sets, and add the card_catalog view.
--
-- 1. sets.code held the API's opaque slug ("muw6lmtzwg") instead of the real
--    set acronym ("P24"). scripts/sync-cards.mjs wrote `code: set.id` when the
--    payload also carries `set.prefix`, which is the acronym players use.
--
--    The remap MUST happen in place, keyed on the old slug, so each set keeps
--    its uuid. Letting the sync insert prefix-coded rows instead would create
--    56 new sets; cards would then be upserted against the new set_ids, and
--    because cards_printing_key is unique on (set_id, card_number, rarity,
--    image_url) the catalog would double to ~9,008 rows with 4,504 orphans.
--
-- 2. sets.rank drives which printing represents a card in the grid. Promotional
--    printings were winning, which is rarely the recognizable art.
--      1 = base expansion        (ALC, MRC, AMB, HVN, DTR, PTM, RDO, FTC, DOA 1st)
--      2 = variant of a base set (First/Alter editions, starter decks,
--                                 Armaments, Re:Collection, draft/event packs)
--      3 = promo, demo, supporter pack, collaboration
--    Note there is no plain "DOA" set: Dawn of Ashes ships only as First
--    Edition, Prelude, Alter and Starter Decks, so "DOA 1st" is ranked as the
--    base printing.
--    New sets from a future sync default to 2 — visible, but never outranking
--    a curated base expansion until someone ranks them.
--
-- 3. public.card_catalog collapses printings to one row per card name, applying
--    the ranking above, so /cards can paginate in Postgres instead of
--    downloading the whole catalog and slicing it in the browser.
--
-- Safe to re-run: the remap matches on the old slug and finds nothing once
-- applied, and the rank update is keyed on the final code.

alter table public.sets
  add column if not exists rank smallint not null default 2;

comment on column public.sets.rank is
  'Printing preference: 1 = base expansion, 2 = variant, 3 = promo/demo. Lower wins in public.card_catalog.';

with mapping(slug, prefix, rank) as (
  values
    ('ul4js2p1ru', 'ALC', 1),
    ('c42ya8o3ko', 'ALC 1st', 2),
    ('38iythn2z4', 'ALC Alter', 2),
    ('85xc5z8f33', 'ALCSD', 2),
    ('7pk8b8vm9v', 'AMB', 1),
    ('hkwbw1cw1y', 'AMB 1st', 2),
    ('5a24607199', 'AMB Alter', 2),
    ('jd3jiszu3u', 'AMBDP', 2),
    ('fst6wv2m5a', 'AMBSD', 2),
    ('B7qo9CRymS', 'DEMO22', 3),
    ('2zr5ys29xx', 'DEMO23', 3),
    ('qJQf0KvMlM', 'DOA 1st', 1),
    ('0ytSM0g3IQ', 'DOA Alter', 2),
    ('hkfYLCbmRJ', 'DOAp', 2),
    ('LD4LDYXx1k', 'DOASD', 2),
    ('f539744941', 'DTR', 1),
    ('ab030ff2cc', 'DTR 1st', 2),
    ('369e36be1f', 'DTRSD', 2),
    ('nkcqkdnuii', 'EVP', 3),
    ('urjyrlu1pp', 'FTC', 1),
    ('if7lf8ipdD', 'FTCA', 2),
    ('cyWbKxReII', 'GSC', 3),
    ('67uvnnrprp', 'HVN', 1),
    ('28fb5edf8a', 'HVN 1st', 2),
    ('h8b4Epbjym', 'KSP', 3),
    ('urjxrku1pp', 'MRC', 1),
    ('Zwmqo1p2mz', 'MRC 1st', 2),
    ('a8950b3290', 'MRC Alter', 2),
    ('8b1e5f77cd', 'P22', 3),
    ('85XB5g8f32', 'P23', 3),
    ('muw6lmtzwg', 'P24', 3),
    ('14be18b93e', 'P25', 3),
    ('8a5a6c2b25', 'P26', 3),
    ('8108532faa', 'PP1', 3),
    ('jg8mf9jqee', 'PRXY', 3),
    ('c15ff15598', 'PTM', 1),
    ('c3ecaafb76', 'PTM 1st', 2),
    ('1d9c44bb06', 'PTMEVP', 3),
    ('13f47307cc', 'PTMLGS', 2),
    ('90ec0d2ed5', 'RDO', 1),
    ('8a9222bbc1', 'RDO 1st', 2),
    ('09586547ee', 'RDOA', 2),
    ('aff6e1eb29', 'RDOEVP', 3),
    ('1ca21783cd', 'RDOP', 2),
    ('f2c0af1699', 'RDOPD', 2),
    ('a8912ffe6b', 'ReC-AUR', 2),
    ('d0f796adc5', 'ReC-BRV', 2),
    ('3qci8c2wz3', 'ReC-HVF', 2),
    ('f1bxvdbqfu', 'ReC-IDY', 2),
    ('mjbqjcmthh', 'ReC-SHD', 2),
    ('if7lf8ipdd', 'ReC-SLM', 2),
    ('jop1n32xa5', 'SLC', 3),
    ('eb3ha4E99', 'SP1', 3),
    ('tqiwpjt0oo', 'SP2', 3),
    ('026fbde1a3', 'SP3', 3),
    ('a4feffd891', 'SP4', 3)
)
update public.sets s
   set code = m.prefix
  from mapping m
 where s.code = m.slug;

with mapping(slug, prefix, rank) as (
  values
    ('ul4js2p1ru', 'ALC', 1),
    ('c42ya8o3ko', 'ALC 1st', 2),
    ('38iythn2z4', 'ALC Alter', 2),
    ('85xc5z8f33', 'ALCSD', 2),
    ('7pk8b8vm9v', 'AMB', 1),
    ('hkwbw1cw1y', 'AMB 1st', 2),
    ('5a24607199', 'AMB Alter', 2),
    ('jd3jiszu3u', 'AMBDP', 2),
    ('fst6wv2m5a', 'AMBSD', 2),
    ('B7qo9CRymS', 'DEMO22', 3),
    ('2zr5ys29xx', 'DEMO23', 3),
    ('qJQf0KvMlM', 'DOA 1st', 1),
    ('0ytSM0g3IQ', 'DOA Alter', 2),
    ('hkfYLCbmRJ', 'DOAp', 2),
    ('LD4LDYXx1k', 'DOASD', 2),
    ('f539744941', 'DTR', 1),
    ('ab030ff2cc', 'DTR 1st', 2),
    ('369e36be1f', 'DTRSD', 2),
    ('nkcqkdnuii', 'EVP', 3),
    ('urjyrlu1pp', 'FTC', 1),
    ('if7lf8ipdD', 'FTCA', 2),
    ('cyWbKxReII', 'GSC', 3),
    ('67uvnnrprp', 'HVN', 1),
    ('28fb5edf8a', 'HVN 1st', 2),
    ('h8b4Epbjym', 'KSP', 3),
    ('urjxrku1pp', 'MRC', 1),
    ('Zwmqo1p2mz', 'MRC 1st', 2),
    ('a8950b3290', 'MRC Alter', 2),
    ('8b1e5f77cd', 'P22', 3),
    ('85XB5g8f32', 'P23', 3),
    ('muw6lmtzwg', 'P24', 3),
    ('14be18b93e', 'P25', 3),
    ('8a5a6c2b25', 'P26', 3),
    ('8108532faa', 'PP1', 3),
    ('jg8mf9jqee', 'PRXY', 3),
    ('c15ff15598', 'PTM', 1),
    ('c3ecaafb76', 'PTM 1st', 2),
    ('1d9c44bb06', 'PTMEVP', 3),
    ('13f47307cc', 'PTMLGS', 2),
    ('90ec0d2ed5', 'RDO', 1),
    ('8a9222bbc1', 'RDO 1st', 2),
    ('09586547ee', 'RDOA', 2),
    ('aff6e1eb29', 'RDOEVP', 3),
    ('1ca21783cd', 'RDOP', 2),
    ('f2c0af1699', 'RDOPD', 2),
    ('a8912ffe6b', 'ReC-AUR', 2),
    ('d0f796adc5', 'ReC-BRV', 2),
    ('3qci8c2wz3', 'ReC-HVF', 2),
    ('f1bxvdbqfu', 'ReC-IDY', 2),
    ('mjbqjcmthh', 'ReC-SHD', 2),
    ('if7lf8ipdd', 'ReC-SLM', 2),
    ('jop1n32xa5', 'SLC', 3),
    ('eb3ha4E99', 'SP1', 3),
    ('tqiwpjt0oo', 'SP2', 3),
    ('026fbde1a3', 'SP3', 3),
    ('a4feffd891', 'SP4', 3)
)
update public.sets s
   set rank = m.rank
  from mapping m
 where s.code = m.prefix
   and s.rank <> m.rank;

-- One row per card name: the representative printing, plus how many printings
-- exist. The window function runs before DISTINCT ON, so printing_count is the
-- true total even though only one row survives.
--
-- Ordering, in priority order:
--   image first  — an imageless tile looks broken, and the old client code
--                  already preferred a printing with art
--   set rank     — base expansion over variant over promo
--   set name     — alphabetical within a tier
--   card_number  — stable tie-break so the choice never flips between queries
create or replace view public.card_catalog
with (security_invoker = true) as
select distinct on (c.name)
  c.id,
  c.name,
  c.set_id,
  c.card_number,
  c.element,
  c.card_type,
  c.class,
  c.rarity,
  c.cost,
  c.power,
  c.life,
  c.speed,
  c.image_url,
  c.illustrator,
  c.is_restricted,
  s.code as set_code,
  s.name as set_name,
  s.rank as set_rank,
  count(*) over (partition by c.name) as printing_count
from public.cards c
left join public.sets s on s.id = c.set_id
order by
  c.name,
  (c.image_url is null),
  s.rank nulls last,
  s.name nulls last,
  c.card_number;

comment on view public.card_catalog is
  'One row per card name — the printing that best represents it (base expansion over variant over promo, alphabetical within a tier). Use for grid/browse; query public.cards directly for a specific printing.';

grant select on public.card_catalog to anon, authenticated;

-- Supports the name search and the name ordering the view and grid both use.
create index if not exists cards_name_idx on public.cards (name);
