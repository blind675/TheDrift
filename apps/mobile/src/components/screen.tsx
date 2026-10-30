import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
};

export function Screen({ eyebrow, title, description, children }: ScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          {eyebrow ? <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</ThemedText> : null}
          <ThemedText style={styles.title}>{title}</ThemedText>
          {description ? (
            <ThemedText style={styles.description} themeColor="textSecondary">
              {description}
            </ThemedText>
          ) : null}
        </View>
        {children}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: 120,
    gap: Spacing.four,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'serif',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '600',
  },
  description: {
    maxWidth: 520,
    fontSize: 16,
    lineHeight: 24,
  },
});
