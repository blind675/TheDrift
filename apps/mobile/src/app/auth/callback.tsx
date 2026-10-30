import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/providers/session-provider';

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { session, loading, authError } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session && !loading) router.replace('/');
  }, [loading, session]);

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), 15_000);
    return () => clearTimeout(timeout);
  }, []);

  const callbackError = authError ?? (timedOut ? 'The app did not receive the session from the sign-in link.' : null);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      {callbackError ? (
        <>
          <ThemedText style={styles.title}>The link could not sign you in.</ThemedText>
          <ThemedText themeColor="textSecondary">{callbackError}</ThemedText>
          <ThemedText onPress={() => router.replace('/sign-in')} style={{ color: theme.accent }}>
            Request another link
          </ThemedText>
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText style={styles.title}>Completing sign-in…</ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
});
