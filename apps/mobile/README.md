# The Drift mobile

Cross-platform Expo/React Native client for The Drift. It shares the existing Supabase project with the web PWA.

## Current phase

- Expo Router navigation for Log, Intent, and Drift
- Persistent Supabase sessions on iOS and Android
- HTTPS-to-native magic-link bridge without a custom email template
- Protected application routes
- Read-only connection check against categories, projects, and entries

The logging, timer, Intent, and Drift interfaces are placeholders for the next phases.

## Local setup

1. Copy `.env.example` to `.env` inside this directory.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the same project values as the web app. A legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` also works.
3. In Supabase Authentication → URL Configuration, add `https://the-drift-five.vercel.app/mobile-auth**` to the allowed redirect URLs.
4. From the repository root, run `pnpm mobile:start`.

Supabase redirects to the HTTPS bridge. The bridge forwards the session to Expo Go's temporary `exp://` callback or to `thedrift://auth/callback` in a development or production build.

## Checks

Run `pnpm mobile:check` from the repository root.
