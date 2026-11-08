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

### Phase 5 — production polish and release readiness

- Account sheet with the signed-in email, web-app shortcut, and sign out
- Pull-to-refresh on Log and Drift, plus an automatic refresh whenever a tab regains focus
- Native iOS and Android application identifiers and build versions
- EAS preview, production-build, and store-submission profiles
- Light and dark themes, mobile empty/error/loading states, and accessible control labels

Intent editing remains available on the web and is intentionally omitted from the mobile navigation.

## Local setup

1. Copy `.env.example` to `.env` inside this directory.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the same project values as the web app. A legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` also works.
3. In Supabase Authentication → URL Configuration, add `https://the-drift-five.vercel.app/mobile-auth**` to the allowed redirect URLs.
4. From the repository root, run `pnpm mobile:start`.

Supabase redirects to the HTTPS bridge. The bridge forwards the session to Expo Go's temporary `exp://` callback or to `thedrift://auth/callback` in a development or production build.

## Checks

Run `pnpm mobile:check` from the repository root.

## Create an installable build

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete free-plan setup, GitHub Actions configuration, cloud-build commands, and app-store requirements.

The app identifiers are `com.catalinandreibora.thedrift` on both platforms. Change them in `app.json` before the first store build if you want a different permanent identifier.

1. Commit the project, then open the mobile directory: `cd apps/mobile`.
2. Sign in to Expo: `npx eas-cli@latest login`.
3. Link or create the EAS project: `pnpm eas:configure`. This adds the Expo project ID to `app.json`.
4. In the Expo project dashboard, add these variables to both the **preview** and **production** environments:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_WEB_URL=https://the-drift-five.vercel.app`
5. Create a physical-iPhone preview with `pnpm eas:preview:ios`, an iOS Simulator build with `pnpm eas:preview:ios-simulator`, or an installable Android APK with `pnpm eas:preview:android`.
6. After testing that build, create store binaries with `pnpm eas:build`.
7. Upload the finished binaries with `pnpm eas:submit`. EAS will prompt for the Apple and Google developer-account credentials it needs.

The local `.env` is intentionally ignored by Git and is not uploaded to EAS. `EXPO_PUBLIC_*` values are embedded in the application bundle, so use only the Supabase project URL and publishable key—never a secret or service-role key.
