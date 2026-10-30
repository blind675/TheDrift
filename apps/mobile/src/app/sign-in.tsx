import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authBridgeUrl, authCallbackUrl } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function SignInScreen() {
  const theme = useTheme();
  const { authError, sendMagicLink } = useSession();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSendMagicLink() {
    setSending(true);
    setSent(false);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch {
      // The provider exposes the user-facing error.
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.page, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.brandRow}>
          <View style={[styles.mark, { backgroundColor: theme.hero }]}>
            <ThemedText style={[styles.markText, { color: theme.heroText }]}>D</ThemedText>
          </View>
          <ThemedText style={styles.brand}>The Drift</ThemedText>
        </View>

        <View style={styles.content}>
          <View style={styles.copy}>
            <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>Welcome back</ThemedText>
            <ThemedText style={styles.title}>Your time, wherever you are.</ThemedText>
            <ThemedText style={styles.description} themeColor="textSecondary">
              Sign in with the same email you use on the web. The link will return directly to the mobile app.
            </ThemedText>
          </View>

          <View style={[styles.form, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={styles.label}>Email address</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!sending && isSupabaseConfigured}
              keyboardType="email-address"
              onChangeText={setEmail}
              onSubmitEditing={() => void handleSendMagicLink()}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="send"
              style={[
                styles.input,
                { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
              ]}
              value={email}
            />
            <Pressable
              accessibilityRole="button"
              disabled={sending || !isSupabaseConfigured}
              onPress={() => void handleSendMagicLink()}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent },
                (pressed || sending || !isSupabaseConfigured) && styles.buttonMuted,
              ]}>
              <ThemedText style={styles.buttonText}>{sending ? 'Sending…' : 'Send magic link'}</ThemedText>
            </Pressable>

            {sent ? (
              <ThemedText style={{ color: theme.positive }}>Check your email, then open the link on this device.</ThemedText>
            ) : null}
            {authError ? <ThemedText style={{ color: theme.accent }}>{authError}</ThemedText> : null}
            {!isSupabaseConfigured ? (
              <ThemedText style={{ color: theme.accent }}>
                Supabase environment variables are missing. See apps/mobile/.env.example.
              </ThemedText>
            ) : null}
          </View>
        </View>

        <ThemedText style={styles.callback} themeColor="textSecondary">
          Supabase bridge: {authBridgeUrl}{'\n'}App callback: {authCallbackUrl}
        </ThemedText>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  mark: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'serif', fontSize: 30, lineHeight: 34, fontWeight: '700' },
  brand: { fontFamily: 'serif', fontSize: 27, lineHeight: 32, fontWeight: '700' },
  content: { flex: 1, justifyContent: 'center', gap: Spacing.five },
  copy: { gap: Spacing.three },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontFamily: 'serif', fontSize: 44, lineHeight: 49, fontWeight: '600' },
  description: { fontSize: 16, lineHeight: 24 },
  form: { borderWidth: 1, borderRadius: 24, padding: Spacing.four, gap: Spacing.three },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, height: 52, fontSize: 16 },
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  callback: { fontSize: 11, lineHeight: 16 },
});
