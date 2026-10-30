import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountMenu } from '@/components/account-menu';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({ eyebrow, title, description, children, refreshing = false, onRefresh }: ScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={onRefresh ? (
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />
      ) : undefined}
      keyboardShouldPersistTaps="handled">
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            {eyebrow ? <ThemedText style={[styles.eyebrow, styles.headerEyebrow, { color: theme.accent }]}>{eyebrow}</ThemedText> : <View />}
            <AccountMenu />
          </View>
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
  headerTopRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerEyebrow: {
    flex: 1,
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
