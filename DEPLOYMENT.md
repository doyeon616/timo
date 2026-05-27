# Supabase Auth + Web Deployment

## 1. Create the Supabase database tables

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the SQL in `supabase/schema.sql`.

This creates:

- `timo_users`: Supabase Auth user profiles, role onboarding, and the full app-state snapshot.
- `timo_tasks`: one row per task so tasks can be queried, filtered, audited, and tracked over time.
- `timo_user_activity_days`: one row per user per active day for daily active user and retention reporting.

The schema resets the existing `timo_users`, `timo_tasks`, and `timo_user_activity_days` tables. This is intended for the current no-user launch state.

If the production database already has users, do not rerun `supabase/schema.sql`. Run `supabase/add_user_activity_days.sql` and `supabase/add_user_role.sql` instead to add the new fields without dropping data.

## 2. Get Supabase environment values

In Supabase, open **Project Settings > API** and copy:

- `Project URL` -> `SUPABASE_URL`
- `anon public` key -> `SUPABASE_ANON_KEY`
- `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

Keep the service role key server-side only. Do not put it in browser JavaScript.

## 3. Configure Supabase Auth email verification

In Supabase, open **Authentication > URL Configuration**:

- Set **Site URL** to the public app origin, for example `https://your-app.vercel.app`.
- Add the same URL to **Redirect URLs**.

In **Authentication > Providers > Email**, keep email confirmations enabled.

For production sending, configure Supabase Auth SMTP. You can use Resend there, but the app no longer needs `RESEND_API_KEY` or `EMAIL_FROM` in Vercel. Without custom SMTP, Supabase's built-in sender is only for setup/testing and can refuse email delivery to regular users.

## 4. Run locally with Supabase

Create a `.env` file from `.env.example`, then run:

```bash
npm start
```

Open `http://localhost:3000`.

## 5. Deploy to Vercel

1. Push the latest code to GitHub.
2. Open Vercel and choose **Add New > Project**.
3. Import `doyeon616/timo`.
4. Keep the default framework preset as **Other**.
5. Add Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN` = `https://timo.kr`
6. In Supabase Auth URL Configuration, set the production site URL to `https://timo.kr` and add `https://timo.kr` to redirect URLs.
7. Deploy.

Vercel serves the frontend as static files and routes `/api/*` to `api/index.mjs`.

## 6. Other Node Hosts

You can also use Render, Railway, Fly.io, or a VPS.

Set:

- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_ORIGIN` = `https://timo.kr` for production

The server already reads `process.env.PORT`, so the host can assign the public port automatically.

## Notes

- API signup and login require Supabase Auth environment variables.
- Sessions are Supabase Auth access and refresh tokens, so redeploys no longer invalidate everyone by clearing server memory.
- Add password reset flows before public launch if users need self-service account recovery.
