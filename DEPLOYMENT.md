# Supabase + Web Deployment

## 1. Create the Supabase database table

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the SQL in `supabase/schema.sql`.

## 2. Get Supabase environment values

In Supabase, open **Project Settings > API** and copy:

- `Project URL` -> `SUPABASE_URL`
- `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

Keep the service role key server-side only. Do not put it in browser JavaScript.

## 3. Run locally with Supabase

Create a `.env` file from `.env.example`, then run:

```bash
npm start
```

Open `http://localhost:3000`.

## 4. Deploy to Vercel

1. Push the latest code to GitHub.
2. Open Vercel and choose **Add New > Project**.
3. Import `doyeon616/timo`.
4. Keep the default framework preset as **Other**.
5. Add Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy.

Vercel serves the frontend as static files and routes `/api/*` to `api/index.mjs`.

## 5. Other Node Hosts

You can also use Render, Railway, Fly.io, or a VPS.

Set:

- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

The server already reads `process.env.PORT`, so the host can assign the public port automatically.

## Notes

- Without Supabase env vars, the app falls back to `.data/db.json` for local development.
- Current sessions are stored in server memory, so users may need to log in again after a redeploy or server restart.
- For a larger production app, replace the custom auth with Supabase Auth and add email verification/password reset flows.
