import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadDriftOverview, type DriftOverview } from '@/lib/drift-service';
import { useSession } from '@/providers/session-provider';

export default function LogScreen() {
  const theme = useTheme();
  const { session, signOut } = useSession();
  const [overview, setOverview] = useState<DriftOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.id) return;
    void loadDriftOverview(session.user.id)
      .then(setOverview)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load your data.'));
  }, [session?.user.id]);

  return (
    <Screen
      eyebrow="Mobile foundation"
      title="Where did your time go?"
      description="The native app is connected to the same Supabase account as The Drift on the web.">
      <View style={[styles.hero, { backgroundColor: theme.hero }]}>
        <ThemedText style={[styles.heroEyebrow, { color: theme.accent }]}>Connection</ThemedText>
        {!overview && !error ? <ActivityIndicator color={theme.heroText} /> : null}
        {overview ? (
          <View style={styles.metrics}>
            <Metric value={overview.entries} label="entries" />
            <Metric value={overview.projects} label="projects" />
            <Metric value={overview.categories} label="categories" />
          </View>
        ) : null}
        {error ? <ThemedText style={{ color: theme.heroText }}>{error}</ThemedText> : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.cardCopy}>
          <ThemedText style={styles.cardTitle}>Phase 1 is ready</ThemedText>
          <ThemedText themeColor="textSecondary">
            Authentication, protected navigation, session persistence, and a read-only Supabase connection are in place.
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, pressed && styles.pressed]}>
          <ThemedText>Sign out</ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metric}>
      <ThemedText style={[styles.metricValue, { color: theme.heroText }]}>{value}</ThemedText>
      <ThemedText style={[styles.metricLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 28,
    padding: Spacing.four,
    gap: Spacing.three,
    minHeight: 170,
    justifyContent: 'center',
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  metrics: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  metric: {
    gap: Spacing.one,
  },
  metricValue: {
    fontFamily: 'serif',
    fontSize: 36,
    lineHeight: 40,
  },
  metricLabel: {
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  cardCopy: {
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
