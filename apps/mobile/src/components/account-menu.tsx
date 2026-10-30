import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/providers/session-provider';

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://the-drift-five.vercel.app').replace(/\/$/, '');

export function AccountMenu() {
  const theme = useTheme();
  const { session, signOut } = useSession();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmSignOut = () => {
    Alert.alert('Sign out of The Drift?', 'You will need a new magic link to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          setError(null);
          void signOut()
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'You could not be signed out.'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <>
      <Pressable
        accessibilityLabel="Open account settings"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <ThemedText style={styles.triggerText}>•••</ThemedText>
      </Pressable>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>Account</ThemedText>
              <ThemedText style={styles.title}>The Drift</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close account settings" hitSlop={10} onPress={() => setVisible(false)}>
              <ThemedText style={styles.close}>×</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">Signed in as</ThemedText>
            <ThemedText style={styles.email}>{session?.user.email ?? 'Unknown email'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your mobile and web apps use the same Supabase account and data.
            </ThemedText>
          </View>

          {error ? (
            <View style={[styles.error, { borderColor: theme.accent }]}>
              <ThemedText style={{ color: theme.accent }}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(webUrl)}
            style={({ pressed }) => [styles.button, { borderColor: theme.border, backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>Open the web app</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.button, { borderColor: theme.accent }, (pressed || busy) && styles.pressed]}>
            {busy ? <ActivityIndicator color={theme.accent} /> : <ThemedText style={[styles.buttonText, { color: theme.accent }]}>Sign out</ThemedText>}
          </Pressable>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">Intent is managed in the web app.</ThemedText>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },
  trigger: { width: 42, height: 42, borderWidth: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  triggerText: { fontSize: 18, lineHeight: 20, letterSpacing: 1.5, marginTop: -5 },
  page: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontFamily: 'serif', fontSize: 38, lineHeight: 44, fontWeight: '700' },
  close: { fontSize: 34, lineHeight: 38 },
  card: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.two },
  email: { fontSize: 18, lineHeight: 25, fontWeight: '800' },
  error: { borderWidth: 1, borderRadius: 14, padding: Spacing.three },
  button: { minHeight: 54, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  buttonText: { fontSize: 16, fontWeight: '800' },
  footer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
});
