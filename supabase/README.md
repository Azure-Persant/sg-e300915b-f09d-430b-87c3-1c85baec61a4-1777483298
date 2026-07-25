# Supabase database setup

`migrations/20260725000000_baseline.sql` is the authoritative baseline for new
Supabase projects. It creates the application schema, authentication profile
trigger, indexes, constraints, and row-level security policies without sample
data or destructive table replacement.

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

Do not commit the database password, access token, service-role key, or cron
secret. After applying the baseline, regenerate `src/integrations/supabase/database.types.ts`
from the new project and review the diff before committing it.

## Runtime configuration

The browser application requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The protected card synchronization endpoint additionally requires these
server-only variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Vercel invokes `/api/sync-cards` daily. It sends `CRON_SECRET` as a bearer token;
catalog writes are performed with the server-only service-role client. Never
prefix the service-role key with `NEXT_PUBLIC_`.

## Run the initial sync without a terminal

After applying the baseline and deploying the application, open `/sync`
on the deployed site. Enter the same `CRON_SECRET` configured in Vercel and
select **Start card sync**. Leave **Force a full sync** off for the initial
import; an empty catalog is populated fully automatically.

The former `/admin/sync` address redirects to `/sync` for compatibility. If
either address returns 404, confirm that the deployment includes the commit
that added `src/pages/sync.tsx`; changing a Vercel environment variable does not
deploy unmerged source changes.

The page does not store the secret. Enter `CRON_SECRET` only—never enter the
Supabase service-role key into a browser form. If the original cron secret is
not available to you because Vercel masks it, replace `CRON_SECRET` in Vercel
with a new value you control and redeploy before using the page.
