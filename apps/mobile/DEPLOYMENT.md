# Mobile cloud builds and deployment

The repository uses Expo Build for signed cloud builds and GitHub Actions for CI/CD orchestration. A paid Expo plan is not required. The workflows deliberately do not create a native cloud build on every commit, so the free-plan build allowance is only used when you explicitly start one.

## What can be built without other paid accounts

- **Android APK:** install directly on an Android device. No Google Play developer account is needed.
- **iOS Simulator app:** install on an iOS Simulator on a Mac. No Apple Developer membership is needed.
- **Physical iPhone, TestFlight, or App Store:** Apple requires a paid Apple Developer Program membership. This is an Apple requirement, not an Expo-plan requirement.
- **Google Play deployment:** requires a Google Play Console developer account. You can still build and install the Android APK without it.

## One-time Expo setup

Run these commands from the repository:

```bash
cd apps/mobile
npx eas-cli@latest login
pnpm eas:configure
```

Choose or create your Expo project when prompted. The command adds `extra.eas.projectId` to `app.json`; commit that change because cloud builds and CI tokens need the project to be linked.

In the Expo dashboard for the new project, add the following variables to both the **preview** and **production** environments:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_WEB_URL` with the value `https://the-drift-five.vercel.app`

These are public client configuration values. Never add a Supabase secret key or service-role key to the mobile build.

## Create the first cloud build locally

Run the first build interactively so Expo can create and store any signing credentials it needs.

Installable Android APK:

```bash
pnpm eas:preview:android
```

Expo prints a build URL. When the build finishes, open that URL on an Android phone and install the APK.

iOS Simulator build:

```bash
pnpm eas:preview:ios-simulator
```

This build runs only in the iOS Simulator on a Mac; it cannot be installed on a physical iPhone.

## Enable GitHub cloud builds

1. Create a personal access token at <https://expo.dev/accounts/[account]/settings/access-tokens>. Limit it to the Expo account that owns this project when that option is available.
2. Open the GitHub repository, then go to **Settings → Secrets and variables → Actions**.
3. Create a repository secret named `EXPO_TOKEN` and paste the token.
4. Commit and push `app.json`, `eas.json`, and the workflows in `.github/workflows/`.
5. Open the repository's **Actions** tab and select **Mobile cloud build**.
6. Choose **Run workflow**, then select one of:
   - `ios-preview` for an ad hoc build installable on registered iPhones
   - `ios-production` for a TestFlight/App Store build
   - `android-preview`
   - `ios-simulator`
   - `production-all`

The workflow validates the application, sends the source to Expo Build, prints the Expo dashboard URL, and exits without occupying GitHub's runner while the native build continues.

## Production store builds

Production binaries can be created with:

```bash
pnpm eas:build
```

For an iOS-only production build, use `pnpm eas:build:ios`. For a physical-iPhone preview build, use `pnpm eas:preview:ios`; Expo will use your Apple Developer account to register the device and create an ad hoc provisioning profile.

Before using automatic store submission, complete the store setup interactively:

- Apple: join the Apple Developer Program, create the app in App Store Connect, and configure the App Store Connect API key in Expo.
- Android: create the app in Google Play Console and connect a Google service-account key in Expo.

The GitHub cloud-build workflow has an optional **Submit production builds** checkbox. Leave it off until both stores and their credentials are configured. Android submissions use the internal testing track; iOS submissions go to TestFlight, not directly to public App Store review.

## CI behavior

- Pull requests and pushes affecting the mobile project run lint, TypeScript, and Android/iOS bundle checks in GitHub Actions.
- Native Expo cloud builds run only through the manually triggered **Mobile cloud build** workflow.
- Local `.env` files are ignored and are never uploaded by GitHub Actions. Expo injects the preview or production environment configured in its dashboard.
