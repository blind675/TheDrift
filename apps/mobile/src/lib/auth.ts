import * as Linking from 'expo-linking';

import { getSupabase } from '@/lib/supabase';

// Expo Go uses its exp:// development URL, while development and production
// builds use the custom `thedrift` scheme configured in app.json.
export const authCallbackUrl = Linking.createURL('auth/callback');
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://the-drift-five.vercel.app').replace(/\/$/, '');
export const authBridgeUrl = `${webUrl}/mobile-auth?return_to=${encodeURIComponent(authCallbackUrl)}`;

export async function requestMagicLink(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter your email address.');

  const { error } = await getSupabase().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      // Supabase reliably accepts the HTTPS bridge. The bridge then forwards
      // the URL fragment containing the session to Expo Go or the native app.
      emailRedirectTo: authBridgeUrl,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function completeAuthFromUrl(url: string): Promise<void> {
  const callback = new URL(url);
  const errorDescription = callback.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const code = callback.searchParams.get('code');
  if (code) {
    const { error } = await getSupabase().auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
  const accessToken = callback.searchParams.get('access_token') ?? hash.get('access_token');
  const refreshToken = callback.searchParams.get('refresh_token') ?? hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await getSupabase().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  throw new Error('The sign-in link did not contain a valid authentication code.');
}
