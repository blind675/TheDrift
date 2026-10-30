import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DriftScreen() {
  const theme = useTheme();
  return (
    <Screen eyebrow="Drift" title="See the movement." description="Native summaries and charts will follow after logging and timers reach feature parity.">
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={styles.title}>Data connection established</ThemedText>
        <ThemedText themeColor="textSecondary">
          Drift will read the existing entries, allocations, projects, and intent history without requiring a second backend.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: Spacing.four, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: '700' },
});
