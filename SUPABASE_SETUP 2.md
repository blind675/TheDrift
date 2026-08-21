# Supabase setup for The Drift

You need a free Supabase project, one private user account, and two public values copied into the app. The database remains protected by Row Level Security; knowing the website URL or the Supabase URL is not enough to read your data.

## 1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard), sign in, and choose **New project**.
2. Name it `the-drift`, choose a nearby region, create a strong database password, and save that password in your password manager.
3. Wait until the project reports that it is ready.

## 2. Create the tables

1. In the Supabase sidebar, open **SQL Editor**.
2. Choose **New query**.
3. Open this project's `supabase/schema.sql`, copy the whole file, paste it into the editor, and press **Run**.
4. The result should say `Success. No rows returned`. In **Table Editor**, confirm these tables exist: `categories`, `entries`, `entry_allocations`, `intent_versions`, `intent_ranks`, and `running_timer`.

Run the schema only once on a fresh project. If you need to start over during development, it is simpler to create another free project than to partially rerun the script.

## 3. Create your private login

1. Open **Authentication → Users**.
2. Choose **Add user → Create new user**.
3. Enter the email and password you want to use in The Drift. Leave **Auto Confirm User** enabled.
4. Copy the user's UUID; you will use it once while seeding categories.
5. Open **Authentication → Providers → Email** and turn off **Allow new users to sign up** after your account exists. This keeps the app single-user.

## 4. Seed the eleven starting categories

1. In **SQL Editor**, open a new query.
2. Copy `supabase/seed.sql` into it.
3. Replace `YOUR_USER_UUID` on the first line with the UUID from step 3.
4. Press **Run**. In **Table Editor → categories**, you should see ten discretionary categories and Maintenance.

The seed script can be rerun safely for the same user: it skips category names that already exist.

## 5. Copy the safe browser credentials

1. Open **Project Settings → Data API**.
2. Copy the **Project URL**.
3. Copy the **Publishable key**. In older projects this may be labelled the `anon` public key.
4. Copy `.env.example` to `.env.local` and replace the two placeholders. You can also enter the same values in the app's Settings sheet.

Never put the `service_role` or secret key in this app. A browser app cannot keep a secret; Row Level Security is what protects the data.

## 6. Authentication URL settings

1. Open **Authentication → URL Configuration**.
2. While developing, set **Site URL** to the local address printed by the app, currently `http://localhost:3001`.
3. After deployment, replace it with the final HTTPS website URL.
4. Add both the local and deployed URLs under **Redirect URLs**, each followed by `/**`.

## 7. Verify the security rules

In **SQL Editor**, run:

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

You should see one ownership policy for each table. Do not disable RLS, even though this is a personal app.

## 8. Connect and test authentication

1. Start the app and open **••• → Connect your data**.
2. Enter only the account email from step 3; the project URL and public key are read automatically from `.env`.
3. Press **Send sign-in code**, then enter the six-digit code from the Supabase email in the app.
4. If Supabase rejects the redirect, add the exact local address and `/**` under **Authentication → URL Configuration → Redirect URLs**.

### Important checkpoint

The app completes passwordless Supabase authentication and persists the session. Once signed in, it loads categories, entries, the latest intent, and any running timer from Supabase, then writes new changes back to Supabase. The header now distinguishes local-only, syncing, synced, offline, and failed states.

Cross-device reads and online writes are now supported. The remaining offline phase is a durable IndexedDB outbox with retry and conflict handling. Until that exists, keep the app online while making signed-in changes.

## 9. Install the PWA

- **iPhone/iPad:** open the deployed HTTPS URL in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the URL in Chrome, open the browser menu, and choose **Install app** or **Add to Home screen**.

The deployed site must use HTTPS for service-worker installation. Localhost is the only development exception.

## Troubleshooting

- **`new row violates row-level security policy`**: you are not signed in, or the inserted `user_id` is different from the signed-in user's UUID.
- **No categories appear**: rerun `seed.sql` with the correct user UUID.
- **Schema script says an object already exists**: it has already been run; do not rerun it on the same database.
- **PWA does not offer installation**: use the deployed HTTPS URL, confirm the manifest loads at `/manifest.webmanifest`, and on iOS use Safari's Share menu.
