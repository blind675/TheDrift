import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildDriftReport, type DriftCategoryRow, type DriftWindow } from '@/lib/drift-analytics';
import { loadDriftAnalytics, type DriftAnalyticsData } from '@/lib/drift-service';
import { useSession } from '@/providers/session-provider';

const windows: { value: DriftWindow; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: '7 days' },
  { value: '30days', label: '30 days' },
  { value: 'all', label: 'All' },
];

export default function DriftScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const [data, setData] = useState<DriftAnalyticsData | null>(null);
  const [window, setWindow] = useState<DriftWindow>('7days');
  const [calculatedAt, setCalculatedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const next = await loadDriftAnalytics(userId);
      setData(next);
      setCalculatedAt(Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your Drift report could not be loaded.');
    }
  }, [userId]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const report = useMemo(
    () => data && calculatedAt ? buildDriftReport(data, window, calculatedAt) : null,
    [calculatedAt, data, window],
  );

  return (
    <Screen
      eyebrow="Intent, meet reality"
      title="Your drift"
      description="See how your logged time compares with the intent you set on the web.">
      <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
        {windows.map((item) => (
          <Pressable
            key={item.value}
            onPress={() => setWindow(item.value)}
            style={[styles.segment, item.value === window && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={{ color: item.value === window ? theme.text : theme.textSecondary }}>
              {item.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {!report && !error ? <ActivityIndicator color={theme.accent} size="large" /> : null}
      {error ? (
        <View style={[styles.errorCard, { borderColor: theme.accent, backgroundColor: `${theme.accent}14` }]}>
          <ThemedText style={{ color: theme.accent }}>{error}</ThemedText>
          <Pressable onPress={() => void refresh()}><ThemedText style={{ color: theme.accent, fontWeight: '800' }}>Try again</ThemedText></Pressable>
        </View>
      ) : null}

      {report ? (
        <>
          <View style={[styles.summaryGrid, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <Summary label="Discretionary logged" value={formatHours(report.discretionaryMinutes)} />
            <Summary label="Days with entries" value={String(report.daysWithEntries)} />
            <Summary label="Coverage" value={`${report.coverage}%`} />
            <Summary label="Maintenance" value={`${(report.maintenanceMinutesPerDay / 60).toFixed(1)}h/day`} />
          </View>

          <View style={[styles.coverageCard, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary">{report.coverageMessage}</ThemedText>
          </View>

          <Panel title="Rank movement" subtitle="The clearest comparison when logging is patchy." trailing="Intent → Actual">
            {report.rows.map((row) => <RankRow key={row.category.id} row={row} />)}
          </Panel>

          <Panel title="Share gaps" subtitle="Actual share against your intended marker." trailing="Gap · Hours">
            {report.rows.map((row) => <ShareRow key={row.category.id} row={row} />)}
          </Panel>

          <Panel
            title="Project time"
            subtitle="Hours by project for this period."
            trailing={`${(report.projectMinutes / 60).toFixed(1)}h assigned`}>
            {report.projectRows.length ? report.projectRows.map((row) => (
              <View key={row.project.id} style={[styles.projectRow, { borderBottomColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <ThemedText type="smallBold" style={styles.flex}>{row.project.name}</ThemedText>
                  <ThemedText type="smallBold">{(row.minutes / 60).toFixed(1)}h</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{Math.round(row.share * 100)}%</ThemedText>
                </View>
                <View style={[styles.projectTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.projectFill, { backgroundColor: theme.accent, width: `${Math.min(100, row.share * 100)}%` }]} />
                </View>
              </View>
            )) : (
              <ThemedText style={styles.empty} themeColor="textSecondary">No project time logged in this period.</ThemedText>
            )}
          </Panel>

          <View style={[styles.readingNote, { borderLeftColor: theme.text }]}>
            <ThemedText type="smallBold">How to read this</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Intended shares come from the ordering and steepness configured on the web. Maintenance is reported separately and never changes coverage or share gaps.
            </ThemedText>
          </View>

          <Pressable onPress={() => void refresh()} style={styles.refreshButton}>
            <ThemedText style={{ color: theme.accent, fontWeight: '800' }}>Refresh report</ThemedText>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText style={styles.summaryValue}>{value}</ThemedText>
    </View>
  );
}

function Panel({ title, subtitle, trailing, children }: { title: string; subtitle: string; trailing: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.panelHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.flex}>
          <ThemedText style={styles.panelTitle}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText>
        </View>
        <ThemedText style={styles.trailing} themeColor="textSecondary">{trailing}</ThemedText>
      </View>
      {children}
    </View>
  );
}

function RankRow({ row }: { row: DriftCategoryRow }) {
  const theme = useTheme();
  const delta = row.actualRank ? row.intendedRank - row.actualRank : 0;
  const movement = !row.actualRank ? 'Unlogged' : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : 'Held';
  const movementColor = !row.actualRank || delta === 0 ? theme.textSecondary : delta > 0 ? theme.positive : theme.accent;
  return (
    <View style={[styles.rankRow, { borderBottomColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: row.category.color }]} />
      <ThemedText type="smallBold" style={styles.flex}>{row.category.name}</ThemedText>
      <ThemedText type="smallBold">{row.intendedRank}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">→</ThemedText>
      <ThemedText type="smallBold">{row.actualRank || '—'}</ThemedText>
      <ThemedText style={[styles.movement, { color: movementColor }]}>{movement}</ThemedText>
    </View>
  );
}

function ShareRow({ row }: { row: DriftCategoryRow }) {
  const theme = useTheme();
  const actualWidth = Math.min(100, row.actualShare * 300);
  const intendedPosition = Math.min(100, row.intendedShare * 300);
  const gapPoints = Math.round(row.gap * 100);
  return (
    <View style={[styles.shareRow, { borderBottomColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <View style={styles.categoryLabel}>
          <View style={[styles.dot, { backgroundColor: row.category.color }]} />
          <ThemedText type="smallBold">{row.category.name}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: gapPoints >= 0 ? theme.positive : theme.accent }}>
          {gapPoints >= 0 ? '+' : ''}{gapPoints}pp · {row.hours.toFixed(1)}h
        </ThemedText>
      </View>
      <View style={[styles.shareTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.shareFill, { backgroundColor: row.category.color, width: `${actualWidth}%` }]} />
        <View style={[styles.intentMarker, { backgroundColor: theme.text, left: `${intendedPosition}%` }]} />
      </View>
      <View style={styles.rowBetween}>
        <ThemedText style={styles.legendText} themeColor="textSecondary">Actual {Math.round(row.actualShare * 100)}%</ThemedText>
        <ThemedText style={styles.legendText} themeColor="textSecondary">Intent {Math.round(row.intendedShare * 100)}%</ThemedText>
      </View>
    </View>
  );
}

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmented: { flexDirection: 'row', borderRadius: 14, padding: 4 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  summaryGrid: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  summaryCell: { width: '50%', minHeight: 108, padding: Spacing.three, justifyContent: 'space-between' },
  summaryValue: { fontFamily: 'serif', fontSize: 30, lineHeight: 36, fontWeight: '700' },
  coverageCard: { borderRadius: 14, padding: Spacing.three },
  panel: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { padding: Spacing.three, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  panelTitle: { fontFamily: 'serif', fontSize: 25, lineHeight: 30, fontWeight: '700' },
  trailing: { maxWidth: 90, textAlign: 'right', fontSize: 11, lineHeight: 15 },
  rankRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 10, height: 10, borderRadius: 5 },
  movement: { width: 58, textAlign: 'right', fontSize: 10, lineHeight: 14, fontWeight: '800', textTransform: 'uppercase' },
  shareRow: { padding: Spacing.three, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  categoryLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  shareTrack: { height: 10, borderRadius: 6, position: 'relative' },
  shareFill: { height: 10, borderRadius: 6 },
  intentMarker: { position: 'absolute', width: 2, height: 22, borderRadius: 1, top: -6 },
  legendText: { fontSize: 10, lineHeight: 14 },
  projectRow: { padding: Spacing.three, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  projectTrack: { height: 8, borderRadius: 5, overflow: 'hidden' },
  projectFill: { height: 8, borderRadius: 5 },
  empty: { padding: Spacing.four },
  readingNote: { borderLeftWidth: 3, paddingLeft: Spacing.three, gap: Spacing.two },
  refreshButton: { alignItems: 'center', paddingVertical: Spacing.three },
});
