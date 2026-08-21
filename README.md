# The Drift

The Drift is a mobile-first, installable time-allocation tracker. It records what you actually do, keeps your intended priorities as an ordering, and shows the gap without scores, streaks, or judgement.

## Start here

The app can be previewed immediately with local sample data. Supabase requires a one-time project setup before it can hold your real data.

1. Follow **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** from top to bottom.
2. Run **[`supabase/schema.sql`](./supabase/schema.sql)** once to create the tables and security policies.
3. Create your one private account in Supabase Authentication.
4. Put that account's UUID into **[`supabase/seed.sql`](./supabase/seed.sql)** and run it once.
5. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
6. Start the app, open **••• → Connect your data**, enter your email, and use the magic link Supabase sends you.

Important: use only the Supabase **publishable/anon key** in this web app. Never expose the `service_role` or secret key.

## Current connection status

The interface, local persistence, PWA manifest/service worker, database schema, seed data, Row Level Security policies, and persistent passwordless Supabase sessions are present.

When signed out, entries remain local to the device. After signing in, the app loads categories, entries, the latest intent, and any running timer from Supabase. New entries, timer changes, and intent changes are written back to Supabase. A durable offline write queue is not implemented yet, so keep the app online while making signed-in changes.

## Run locally

Requires Node.js 22.13 or later.

```bash
corepack pnpm install
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To verify a production build:

```bash
corepack pnpm build
```

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the repository root as the Root Directory. The included `vercel.json` supplies the build configuration.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under **Project Settings → Environment Variables** for Production and Preview.
5. Deploy the project.
6. In Supabase, open **Authentication → URL Configuration**, set **Site URL** to the production Vercel address, and add that address followed by `/**` under **Redirect URLs**.

Vercel creates a new deployment whenever changes are pushed to the production branch.

## Environment variables

Create `.env.local` (it is ignored by Git):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

The app reads these values automatically. They are not requested in the Settings panel.

## Project map

- `app/page.tsx` — Log, Intent, Drift, and connection settings UI
- `lib/compute.ts` — pure allocation calculations
- `lib/supabase.ts` — Supabase passwordless magic-link request
- `public/manifest.webmanifest` and `public/sw.js` — installable/offline app shell
- `supabase/schema.sql` — tables, constraints, view, and RLS policies
- `supabase/seed.sql` — the eleven initial categories
- `SUPABASE_SETUP.md` — complete dashboard walkthrough and troubleshooting

## Data safety

- Row Level Security is enabled on every personal-data table.
- Every policy checks the signed-in Supabase user ID.
- New public sign-ups should be disabled after your private user is created.
- The app must never receive a Supabase service-role key.
