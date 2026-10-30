# The Drift mobile

Cross-platform Expo/React Native client for The Drift. It shares the existing Supabase project with the web PWA.

## Implemented phases

### Phase 1 — foundation

- Expo Router navigation for Log and Drift
- Persistent Supabase sessions on iOS and Android
- HTTPS-to-native magic-link bridge without a custom email template
- Protected application routes

### Phase 2 — native logging

- Live categories, projects, recent entries, and running timer from Supabase
- Start and stop a timer with project and one- or two-category allocation
- Add finished activities with date, time, notes, project, and category allocation
- Create a project while logging when the typed project does not exist
- Delete an existing activity with confirmation
- Timer state persists across app and web sessions

### Phase 4 — native Drift

- Today, 7-day, 30-day, and all-activity reporting windows
- Rank movement and share gaps using the Intent configured on the web
- Discretionary coverage based on 12 available hours per day, excluding Maintenance
- Cross-midnight and reporting-window clipping for every activity
- Maintenance hours per logged day and project-time statistics

Intent editing remains available on the web and is intentionally omitted from the mobile navigation.

## Local setup

1. Copy `.env.example` to `.env` inside this directory.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the same project values as the web app. A legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` also works.
3. In Supabase Authentication → URL Configuration, add `https://the-drift-five.vercel.app/mobile-auth**` to the allowed redirect URLs.
4. From the repository root, run `pnpm mobile:start`.

Supabase redirects to the HTTPS bridge. The bridge forwards the session to Expo Go's temporary `exp://` callback or to `thedrift://auth/callback` in a development or production build.

## Checks

Run `pnpm mobile:check` from the repository root.
