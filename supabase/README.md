[README.md](https://github.com/user-attachments/files/30478653/README.md)
# Supabase database setup

`migrations/20260725000000_baseline.sql` is the authoritative baseline for new
Supabase projects. It creates the application schema, authentication profile
trigger, indexes, constraints, and row-level security policies without sample
data or destructive table replacement.

`migrations/20260728000000_cards_speed_text.sql` then changes `cards.speed` from
`integer` to `text`. The Grand Archive API returns `card.speed` as a boolean
(true = Fast, false = Slow), so the integer column rejected every sync with
`invalid input syntax for type integer: "false"`. Apply it after the baseline —
`scripts/sync-cards.mjs` writes `"Fast"`/`"Slow"` and will fail against an
integer column.

The files in `legacy_migrations/` are retained only as project history. Do not
apply them to a new or existing database: the old sequence assumes external
schema state and includes a destructive recreation of `user_collections`.

## Initialize a new project

Apply the baseline to an empty Supabase project with either the Supabase CLI or
the dashboard SQL editor. For project `wtifzovtlxttovnguhgo`, link the CLI to
that project before pushing migrations:

```bash
supabase link --project-ref wtifzovtlxttovnguhgo
supabase db push
```

`supabase/.temp/` is local CLI scratch state and may name a different project
ref from an earlier link; it is not runtime configuration. The application reads
its project from `NEXT_PUBLIC_SUPABASE_URL`, and the sync from `SUPABASE_URL`.

Do not commit the database password, access token, service-role key, or cron
secret. After applying the baseline, regenerate `src/integrations/supabase/database.types.ts`
from the new project and review the diff before committing it.

## Runtime configuration

The browser application requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The catalog sync runs in GitHub Actions, not on Vercel, so it needs no
server-only variables in Vercel at all. Set these as **repository** secrets
under Settings > Secrets and variables > Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never prefix the service-role key with `NEXT_PUBLIC_`, and never paste it into a
browser form or a chat message.

## Run the sync

`.github/workflows/sync-cards.yml` runs daily at 06:00 UTC and can be started
manually from the Actions tab (**Run workflow**), with optional `dry_run` and
`max_pages` inputs.

The sync cannot run as a Vercel function: the catalog is ~4,500 printings across
151 API pages because the API caps `page_size` at 30 server-side regardless of
the requested limit. At ~1.7s per page the fetch loop alone takes ~330s, past
Vercel's 300s ceiling — which is why every previous attempt died at 298-300s and
left `sync_history` rows stranded in `running`.

Note that a workflow only registers once it is on the **default branch**.
`workflow_dispatch` shows no **Run workflow** button, and the schedule never
fires, while the file exists only on a feature branch.

To check the fetch and parse path without any database writes or secrets:

```bash
npm run sync:dry
```

A full dry run takes ~96s and should report 151 pages, 4,504 printings, 56 sets,
108 restricted names, 0 UNKNOWN rarities, and `Card rows match the public.cards
schema`.

## Reading sync status

`/sync` is a read-only status page: it shows catalog totals and the last few
`sync_history` rows, including the failure reason when a run fails. It cannot
start a sync — use the Actions tab for that. The former `/admin/sync` address
redirects to `/sync` for compatibility.
