# Azure Card Inventory (Beta) — Handoff

A Grand Archive TCG card database, collection tracker and deck builder.
Next.js 15 (pages router) + Supabase + Tailwind/shadcn, deployed on Vercel.

This document is the working state of the project. It is written to be enough
context on its own — for a fresh session, a new contributor, or to re-establish
context after a chat is compacted.

---

## 1. Where things live

| Thing | Where |
|---|---|
| Repo | `Azure-Persant/sg-e300915b-f09d-430b-87c3-1c85baec61a4-1777483298`, default branch `main` |
| Supabase project | `wtifzovtlxttovnguhgo` |
| Hosting | Vercel, deploys on push to `main` |
| Catalog sync | GitHub Actions, `.github/workflows/sync-cards.yml`, daily 06:00 UTC |
| Card data source | `https://api.gatcg.com` (read once per sync, never at page load) |

**Vercel environment variables** — required for the build, all three
environments (Production, Preview, Development):

```
NEXT_PUBLIC_SUPABASE_URL       = https://wtifzovtlxttovnguhgo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon key>
```

`src/integrations/supabase/client.ts` throws at module load if either is
missing, and 11 pages are statically prerendered, so a missing variable fails
the whole build with `Missing Supabase environment variables`. That is
deliberate: `NEXT_PUBLIC_*` values are inlined at build time, so a build
without them would ship an app whose every query silently fails.

**GitHub repository secrets** — for the sync only:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The service-role key belongs *only* in GitHub secrets. Nothing in the Next.js
build uses it (`src/integrations/supabase/server.ts` exists but is imported
nowhere).

`.env.local` is gitignored and does not persist between sessions. `npm run
sync:dry` needs no secrets at all.

---

## 2. How changes get landed

Sessions have **read-only** GitHub access: `git push` returns 403 and the
GitHub App reports `Resource not accessible by integration`. Pull requests
cannot be opened from a session.

So the workflow is: the session writes and verifies files, sends them, and they
are **pasted into the GitHub web editor** and merged. Use *Edit* (pencil) on
existing files, *Add file → Create new file* for new ones.

Verification that has caught real defects:

* Compare the line count GitHub shows against the expected count — this catches
  truncated pastes.
* After merging, ask the session to diff `origin/main` against what it built.
  That caught a stale `scripts/sync-cards.mjs`, an empty `scripts/synccards.mjs`
  created by a mistyped filename, and a stray
  `[README.md](https://github.com/user-attachments/...)` line inserted by
  drag-and-dropping a file instead of pasting its contents.

**Do not drag files into the GitHub editor.** It inserts an attachment link
rather than the contents.

Granting write access would need **Contents: read and write** plus
**Pull requests: read and write** on the Claude GitHub App installation for the
`Azure-Persant` org. That may not be the account owner's to change.

---

## 3. Data model

All in schema `public`. RLS is on everywhere; card and set data is world
readable, user data is owner-only.

### Catalog

* **`sets`** — `code` is the real acronym (`MRC`, `ALCSD`), from the API's
  `set.prefix`. `rank` is curated: `1` base expansion, `2` variant (First/Alter
  editions, starter decks, Armaments, Re:Collection, draft/event packs), `3`
  promo/demo/supporter. New sets default to `2`.
* **`cards`** — one row per *printing*. 4,504 rows, 56 sets. Display columns
  (`card_type`, `class`) sit alongside structured ones (`types`, `subtypes`,
  `classes` as `text[]`, `cost_memory`, `cost_reserve`).
* **`card_catalog`** (view) — one row per card *name*, choosing the printing
  that best represents it: art present, then `sets.rank`, then set name, then
  collector number. Also exposes `printing_count` and `set_codes` (every set the
  card appears in). This is what the browse grid pages through.
* **`card_filter_options`** (view) — distinct element/type/subtype/class values
  with `count(distinct name)`, so the filter bar populates from one request.

### Collections

* **`user_collections`** — one row per **(user, card, bucket, location)**.
  * `bucket` ∈ `personal` | `sale` | `loaned`
  * `location` is the place, or for a loan *who holds them*. `''` means
    unspecified; required for loans.
  * `quantity` is always **> 0** — a place with no copies is a deleted row.
  * Buckets are counted separately, not carved out of each other: 3 personal +
    2 for sale + 1 lent is 6 copies held.
* **`collection_shares`** — grants of read access. Reached by a 64-hex-char
  `token` in the URL. `invited_email` null means an open link; set means the
  viewer must be signed in as that address. `include_personal` /
  `include_sale` / `include_loaned` decide scope; `expires_at` null means never.

### Sharing functions

Guests never read `user_collections` directly. A select policy there would
expose whole rows, so a for-sale-only share would leak the personal quantity
and location. Instead the base table stays owner-only and readers go through
`security definer` functions returning only permitted columns:

* `resolve_collection_share(token)` — returns nothing for a token that is
  unknown, revoked, expired, or restricted to someone else. Those four are
  **deliberately indistinguishable** so nobody can probe for valid tokens.
* `shared_collection(token)` — per-bucket totals summed across places, plus the
  card detail columns. **No locations, and no borrower names** — a borrower did
  not agree to appear on a shared page.
* `shared_collection_meta(token)` — owner display name, scope, expiry. Falls
  back to `A collector`, never to the email address.

---

## 4. The catalog sync

`scripts/sync-cards.mjs`, run by GitHub Actions. Never on Vercel.

**Why not Vercel:** the API caps `page_size` at 30 regardless of the requested
limit, so the catalog is 151 pages. At ~1.7s a page the fetch loop alone is
~330s, past Vercel's 300s function ceiling. Every attempt died at 298–300s and
left `sync_history` rows stuck in `running`.

```bash
npm run sync:dry      # no secrets, no writes, ~95s
npm run sync          # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

A healthy dry run reports:

```
Catalog: 4504 cards across 151 pages (page_size=30, requested limit=100)
Verified public.cards has all 20 columns
Found 56 distinct sets
Card rows match the public.cards schema (4504 rows × 20 columns)
DRY RUN SYNC COMPLETE — 151 pages, 56 sets, 4504 printings, 108 restricted
Field coverage: power 1719/4504, life 1581/4504, speed 1578/4504, UNKNOWN rarity 0/4504
Distinct speed values: ["Fast","Slow",null]
```

Two safety nets:

* **Schema probe before fetching.** One request checking every column exists;
  on failure it names *all* missing columns and mentions both causes — a pending
  migration, or a stale PostgREST cache needing
  `notify pgrst, 'reload schema';`. This exists because a missing column used to
  surface only at the first upsert, after 91s of fetching.
* **Row/schema type check before any upsert**, so a type mismatch names the
  column rather than appearing as a bare Postgres error mid-batch.

Workflows only register from the **default branch** — `workflow_dispatch` shows
no Run button and the schedule never fires while the file is on a feature
branch.

---

## 5. Grand Archive API facts

Hard-won; all verified against the live API.

| Fact | Consequence |
|---|---|
| `page_size` capped at 30 server-side | 151 pages, ~330s; hence Actions not Vercel |
| `card.speed` is a **boolean** (true=Fast) | `cards.speed` is `text` storing `"Fast"`/`"Slow"`; 1,578 of 4,504 non-null |
| No `card.stats` object | power/life/speed/durability/level are top-level fields; old code read `card.stats.ATK` and always wrote NULL |
| `set.id` is an opaque slug, `set.prefix` is the acronym | `sets.code` stores `prefix`; remapped in place so set UUIDs stayed stable |
| `cost_memory` and `cost_reserve` are **mutually exclusive** | 473 memory-only, 1,762 reserve-only, 5 neither, **0 both**. Both ranges include `-1` (X cost) |
| Classes are **echoed into** `subtypes` | All 2,240 cards. Stripped per card, not by name: `SPIRIT` is a class on 38 cards and a genuine subtype on 4 others. Leaves 138 subtypes, 9 classes |
| `element` is single-valued | 13 values, no card has two |
| `separate_editions=true` returns one row per printing | 4,504 printings vs 2,240 distinct cards |
| Rarity map | `1=C 2=U 3=R 4=SR 5=UR 6=PR 7=CSR 8=CUR 9=CPR` — all 4,504 map, zero UNKNOWN |
| `Nameless Champion` is 15 distinct cards sharing one name | The only name collision in the catalog. `card_catalog` collapses them to one tile. Accepted: it is not a legal card |
| Two sets return a bogus `1970-01-01` release date | Promotional 2026, Supporter Pack 4 — do not sort by release date |

---

## 6. Frontend

**`/cards`** — pages through `card_catalog`, 120 per page, ~53 KB a page. It
previously called a service that looped until it had every printing (~3.61 MB)
and then filtered, grouped and sliced in the browser — on every page click *and
every keystroke*. Search is debounced 300ms.

Filter bar: element, set, type, subtype, class as searchable multi-selects,
memory/reserve cost ranges, and card-name + effect-text search. Logic is **OR
within a control, AND across controls**. Everything runs in Postgres.

**`/collection`** — grouped by card name, one line per place. Edit dialog is an
add/remove list of places per bucket with a datalist of names already in use.
Sharing panel creates/revokes links.

**`/shared/[token]`** — guest view. Counts only, no locations. Tiles open a
detail dialog; the guest function already returns the card columns, so no extra
query.

**`/profile`** — display name, shown on shared collections. Email is read-only
and never shown to guests.

### Images

All card art goes through `next/image` behind `src/components/CardImage.tsx`.
Previously eight raw `<img>` tags pointed at `api.gatcg.com`, and because
`<img>` does not lazy-load, `/cards` fired up to 120 requests at gatcg per
visitor per load. Now the host fetches each image once, caches it at the edge
for 30 days (`minimumCacheTTL`) and lazy-loads below-the-fold tiles.

`images.remotePatterns` is scoped to `api.gatcg.com/cards/images/**` and
`lh3.googleusercontent.com`. It was `hostname: "**"`, which let anyone use
`/_next/image` as an open image proxy on our bandwidth.

Watch Vercel's **image transformation** usage — the first pass over 4,504 cards
costs transformations, then it is cache hits. If it strains the plan, the fix is
mirroring art into Supabase Storage once.

---

## 7. Auth

Email/password plus a Google button on both auth pages.

`handle_new_user()` copies `raw_user_meta_data ->> 'full_name'` into
`profiles.full_name`. The signup form sends it, and Google returns the same key,
so an OAuth account arrives with a display name already set — no extra handling.

**Google requires configuration that code cannot do:**

1. Google Cloud Console → Credentials → OAuth client ID (Web application)
2. Authorized redirect URI:
   `https://wtifzovtlxttovnguhgo.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google → enable, paste client ID and
   secret
4. Supabase → Authentication → URL Configuration → add the Vercel domain to
   **Redirect URLs** (plus `http://localhost:3000`)

Step 4 is the one people miss: without it Google authenticates and Supabase
refuses to redirect back. Until step 3 the button reports *"Google sign-in is
not enabled for this site yet"*.

---

## 8. Migration rules learned the hard way

Applied in timestamp order. **Nothing applies them automatically** — no CI step,
no Vercel hook. A `.sql` file in the repo records intent; someone must run it in
the Supabase **SQL Editor**.

1. **`CREATE OR REPLACE VIEW` can only append columns at the end.** Inserting a
   column mid-list fails with
   `cannot change name of view column "rarity" to "types"`. Drop and recreate
   instead — not `CASCADE`, so a real dependency fails loudly.
2. **`CREATE OR REPLACE FUNCTION` cannot change a return type.** Drop first.
3. **`CREATE POLICY` has no `IF NOT EXISTS`.** Add `DROP POLICY IF EXISTS`
   first or the migration is not re-runnable.
4. **`ALTER COLUMN ... USING` is not idempotent.** The `USING` expression is
   typechecked against the column's *current* type, so a second run fails with
   `operator does not exist: text = integer`. Guard it.
5. **Data conversions need a guard**, e.g. `if not exists (... column ...) then
   return`, so re-running is a no-op rather than a second destructive pass.
6. **`gen_random_bytes` is pgcrypto**, not on Supabase's default `search_path`.
   Use `gen_random_uuid()`.
7. **The SQL Editor only shows the last statement's result.** Run diagnostics
   one at a time.
8. **Deploy order matters when a migration drops columns:** ship the code
   first, let Vercel go green, then run the migration. The reverse breaks the
   live page.

Every migration in this repo is idempotent and was tested against a local
PostgreSQL 16 instance before being handed over, including as an *upgrade over
the previous migration* rather than only against an empty database.

---

## 9. Verification commands

```bash
npm install
npx tsc --noEmit          # must be clean
npx next build            # must compile
npm run sync:dry          # ~95s, no secrets
```

**Type-check against the deployed dependency version, not the lockfile.**
`package-lock.json` pins `@supabase/supabase-js` 2.101.1 but Vercel resolves a
newer 2.x. 2.111.0 added `RejectExcessProperties`, which rejected a
`Record<string, unknown>` that type-checked locally — a build that passed here
and failed on Vercel. To reproduce Vercel:

```bash
npm install --no-save @supabase/supabase-js@latest
npx tsc --noEmit
```

The durable fix is refreshing `package-lock.json` from a terminal
(`npm install && git commit package-lock.json`); it is 376 KB and impractical to
paste through the web editor.

Useful SQL health check:

```sql
select
  (select count(*) from public.cards)                              as cards,
  (select count(*) from public.sets)                               as sets,
  (select count(*) from public.card_catalog)                       as catalog_rows,
  (select count(distinct name) from public.cards where is_restricted) as restricted_names,
  (select count(*) from public.cards where rarity = 'UNKNOWN')      as unknown_rarity,
  (select string_agg(distinct coalesce(speed,'-'), ', ') from public.cards) as speed_values;
```

Expect `4504, 56, ~2226, 108, 0, "-, Fast, Slow"`.

```sql
select kind, count(*) from public.card_filter_options group by kind order by kind;
```

Expect `class 9, element 13, subtype 138, type 15`.

---

## 10. Outstanding

**Next feature, agreed:** deck building with real Grand Archive rules — a
champion, the 4-copy limit, the restricted list (108 names, already synced as
`cards.is_restricted` on every printing), and the material/main deck split. None
of it is enforced or displayed today; `/decks/[id]` accepts anything in any
quantity. `collectionService.getCardOwnership()` already returns per-bucket
counts per printing for the "you are missing N of these" check.

**Known cruft:**

* `.softgen/project-handoff.md` is stale — it documents `/api/sync-cards` and
  `/api/sync-progress`, both deleted. Delete it in favour of this file.
* `src/services/gatcgApiService.ts` is dead code, imported nowhere. Left in
  place, but it is a live invitation to reintroduce runtime calls to gatcg.
* `supabase/.temp/linked-project.json` names a *different* project
  (`penwlalryjvcynzteicp`). Harmless — runtime config comes from env — but a
  footgun for `supabase db push`. Consider gitignoring `supabase/.temp/`.
* `package-lock.json` disagrees with what Vercel installs; see §9.
* Pre-existing lint warnings (unused `error` in catch blocks, an unused `router`
  and `collection`, an unused `Plus` import in `Navigation.tsx`). Untouched
  deliberately to keep diffs focused.

**Accepted, not bugs:**

* `Nameless Champion`'s 15 variants collapse to one tile — not a legal card.
* Locations and borrower names are withheld from guests by design.
* Existing accounts show `A collector` until each person sets a display name.

---

## 11. Commit history worth knowing

The two bugs that originally kept the catalog at 0 rows:

1. **Vercel timeout** — the sync could not finish inside 300s. Fixed by moving
   it to GitHub Actions.
2. **`cards.speed` was `integer`** while the API sends a boolean, so the first
   card batch died with
   `invalid input syntax for type integer: "false" (22P02)` — after all 151
   pages had been fetched.

Since then: real set codes, printing ranking, the `card_catalog` view,
server-side paging and filtering, three-bucket collections, multi-location
holdings, sharing, display names, Google sign-in, and the image CDN.
