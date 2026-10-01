# WordClick on Render with Google accounts

## Current status

The Render account adapter passes 33 local checks with a simulated Supabase provider. Real Google login remains pending provider/redirect configuration. The WordClick Supabase project `zlhveupryhlbybtvfmvu` is in Frankfurt on the connected owner's Free organization after a confirmed project cost of $0/month. The migration is applied, real PostgreSQL RLS/isolation checks passed in a rolled-back transaction, and security advisors reported no notices. Check Render's deployment status for the exact live commit.

The Flask entrypoint is `app:app`. The Sites Worker is a separate hosting adapter and continues to use ChatGPT authentication. Deploying this Flask version to Render keeps the same reader, contextual browser translation, news-first home and logo reset. Production Sites has not been changed by this Render preparation.

## Backups and rollback

- Original pre-account version: tag `worldclick-backup-before-login-20261001`, commit `00d7abd9ee55875097ef0b3c8fee5a607399accf`.
- Last functioning public Sites version: tag `worldclick-backup-before-render-google-20261001`, commit `0de2ced531a75f0fd65b38bf0094af547a9937e2`.
- The original GitHub main commit is preserved on branch `backup/pre-google-auth-20261001`. Changes were prepared separately in `feature/render-google-auth` and PR #1 before rollout.
- Keep the current Render deploy as a rollback target. Deploy an exact reviewed commit only after verifying settings. Rolling back the code does not remove the new database table or modify old Sites/D1 vocabulary.

## Configure Supabase

1. Select the owner's organization and confirm the project's actual cost before creating it. Use a dedicated WordClick project, preferably in an EU region.
2. Apply `supabase/migrations/20261001093202_wordclick_accounts.sql` to that project. It creates only WordClick-specific objects. Read policies and grants before application, then run advisors and verify two-user isolation in the real database.
3. Set Auth's Site URL to `https://worldclick.onrender.com` and add the exact redirect `https://worldclick.onrender.com/auth/callback` to the redirect allowlist. Avoid production wildcards.
4. In Google Auth Platform, create a Web application OAuth client. Set the application origin to `https://worldclick.onrender.com`. Set the Google redirect URI to the actual Supabase project's callback from its Google provider panel: `https://<actual-project-ref>.supabase.co/auth/v1/callback`. This differs from the Flask callback above.
5. Store the Google Client ID and Client Secret in Supabase Auth -> Providers -> Google and enable the provider. Only request email/profile sign-in; no Drive, Gmail or other Google permissions.
6. If Google consent is in testing mode, explicitly add test users. Configure the consent app's audience/publication before broader launch. The app's website being public does not publish the Google OAuth consent app automatically.

Official documentation: https://supabase.com/docs/guides/auth/social-login/auth-google

## Configure the existing Render service

Keep the existing `worldclick` service, GitHub repository and public address. Use these settings:

- Build: `pip install -r requirements.txt` (includes pinned `requirements-render.lock`).
- Start: `gunicorn app:app`. The committed `gunicorn.conf.py` binds `0.0.0.0:$PORT` with one worker, four threads and a 60-second timeout.
- Health check: `/healthz`.
- Runtime environment: `APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY`, as listed in `render.env.example`.
- Generate `SECRET_KEY` securely with at least 32 characters and keep it stable across restarts/workers. Store real values in Render Environment, never in source or screenshots. Do not use a Supabase secret/service-role key. The adapter accepts modern publishable keys only.

Missing configuration leaves reading/translation available, hides the login button and does not pretend that words were saved. The adapter also checks Supabase's public Auth settings and keeps Google login hidden until the provider is enabled (settings are cached for 30 seconds). Configure both callback allowlists before enabling it. `/healthz` checks process availability, not readiness of external Google configuration.

## Account protections

Google sign-in uses Supabase OAuth with S256 PKCE. The verifier is in a signed, Secure, HttpOnly, SameSite=Lax cookie. The callback is fixed from `APP_BASE_URL`; user `next`/Host values cannot redirect it. Codes without a matching verifier, expired flows and unverifiable users are rejected. Tokens are never returned to browser JavaScript, stored in localStorage or logged.

Every library operation calls Supabase Auth's user endpoint and uses the verified UUID. Caller-supplied Sites identity headers, email, `user_id` and editable metadata never authorize a request. Supabase data calls carry the user's access token and the publishable key. Table grants and per-operation RLS policies restrict rows to `auth.uid()`. The save RPC uses SECURITY INVOKER and performs an atomic upsert preserving stable IDs and previous study fields. No service-role bypass is used.

Mutation APIs require same-origin requests and a session CSRF token. Logout is POST with CSRF validation. Authentication refreshes near expiry; invalid sessions are cleared. Responses are not shared-cacheable. This session implementation requires the Flask server; do not expose the Sites adapter outside its trusted dispatcher.

The original Sites/D1 library remains intact. Google/Supabase accounts have different identifiers; the implementation does not silently merge them or import another origin's localStorage. Existing words must be migrated only after confirming ownership of both accounts.

## Validation

For this Render branch, run:

```sh
python scripts/verify-render.py
node scripts/verify-translation-recovery.mjs
node scripts/verify-context.mjs
```

The Render checks simulate the provider and test PKCE binding, Secure/HttpOnly cookies, forged headers, CSRF/origin rejection, separate account reads/deletes, refresh/logout and exact context preprocessing. The real database check additionally verified owner reads/writes, two-account isolation, stable IDs, preserved study progress, foreign-owner insert/delete denial, and anonymous table/RPC denial. The test transaction was rolled back, leaving no test accounts or words. A real Google browser login is still pending. Once configured, verify guest reading, an actual Google login, saving/reloading a word, two Google accounts' isolation, logout, and persistence through a Render redeploy. Do not use end users' passwords or tokens for the tests.
