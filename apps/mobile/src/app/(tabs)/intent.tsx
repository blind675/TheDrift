import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function IntentScreen() {
  const theme = useTheme();
  return (
    <Screen eyebrow="Intent" title="What matters now?" description="Ranking and intent editing arrive in the next implementation phase.">
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={styles.title}>Shared business logic</ThemedText>
        <ThemedText themeColor="textSecondary">
          This screen will reuse the same category ranking, steepness, and target-share model as the web app.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: Spacing.four, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: '700' },
});
