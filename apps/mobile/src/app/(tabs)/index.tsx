import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearRunningTimer,
  createEntry,
  createProject,
  deleteEntry,
  loadDriftLog,
  saveRunningTimer,
  type DriftCategory,
  type DriftEntry,
  type DriftLogData,
  type DriftProject,
  type DriftTimer,
} from '@/lib/drift-service';
import { useSession } from '@/providers/session-provider';

const weights = [50, 60, 70, 80, 90];

export default function LogScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const [data, setData] = useState<DriftLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [timerLabel, setTimerLabel] = useState('');
  const [timerCategory, setTimerCategory] = useState('');
  const [timerCategory2, setTimerCategory2] = useState('');
  const [timerProject, setTimerProject] = useState('');
  const [timerSplit, setTimerSplit] = useState(false);
  const [timerWeight, setTimerWeight] = useState(80);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    setError(null);
    try {
      const next = await loadDriftLog(userId);
      setData(next);
      setTimerCategory((current) => current || next.categories[0]?.id || '');
      setTimerCategory2((current) => current || next.categories[1]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your log could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useEffect(() => {
    if (!data?.timer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [data?.timer]);

  const categoryById = useMemo(
    () => new Map((data?.categories ?? []).map((category) => [category.id, category])),
    [data?.categories],
  );
  const projectById = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );

  const resolveProject = useCallback(async (rawName: string): Promise<string | undefined> => {
    if (!data || !userId) return undefined;
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name) return undefined;
    const existing = data.projects.find(
      (project) => !project.archived && project.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (existing) return existing.id;
    const created = await createProject(userId, name);
    setData((current) => current ? {
      ...current,
      projects: current.projects.some((project) => project.id === created.id)
        ? current.projects
        : [...current.projects, created].sort((a, b) => a.name.localeCompare(b.name)),
    } : current);
    return created.id;
  }, [data, userId]);

  const startTimer = async () => {
    if (!data || !userId || busy) return;
    const label = timerLabel.trim();
    const category = timerCategory || data.categories[0]?.id;
    if (!label || !category) {
      setError('Add an activity title and category before starting.');
      return;
    }
    if (timerSplit && (!timerCategory2 || timerCategory2 === category)) {
      setError('Choose a different second category.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const projectId = await resolveProject(timerProject);
      const timer: DriftTimer = {
        label,
        category,
        category2: timerSplit ? timerCategory2 : undefined,
        weight: timerSplit ? timerWeight / 100 : 1,
        projectId,
        startedAt: Date.now(),
      };
      await saveRunningTimer(userId, timer);
      setData((current) => current ? { ...current, timer } : current);
      setTimerLabel('');
      setMessage('Timer started and synced.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The timer could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const stopTimer = async () => {
    if (!data?.timer || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const timer = data.timer;
      const saved = await createEntry(userId, {
        label: timer.label,
        start: new Date(timer.startedAt).toISOString(),
        end: new Date().toISOString(),
        category: timer.category,
        category2: timer.category2,
        weight: timer.category2 ? timer.weight : 1,
        projectId: timer.projectId,
      }, 'timer');
      await clearRunningTimer(userId);
      setData((current) => current ? { ...current, timer: null, entries: [saved, ...current.entries] } : current);
      setMessage('Activity added to your log.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The timer could not be stopped.');
    } finally {
      setBusy(false);
    }
  };

  const addFinishedEntry = async (entry: Omit<DriftEntry, 'id'>) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await createEntry(userId, entry);
      setData((current) => current ? { ...current, entries: [saved, ...current.entries] } : current);
      setShowFinished(false);
      setMessage('Finished activity added.');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'The activity could not be saved.';
      setError(detail);
      throw new Error(detail);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (entry: DriftEntry) => {
    if (!userId) return;
    Alert.alert('Delete this activity?', `“${entry.label}” will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteEntry(userId, entry.id)
            .then(() => {
              setData((current) => current ? { ...current, entries: current.entries.filter((item) => item.id !== entry.id) } : current);
              setMessage('Activity deleted.');
            })
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The activity could not be deleted.'));
        },
      },
    ]);
  };

  const groupedEntries = useMemo(() => groupEntries(data?.entries ?? []), [data?.entries]);

  return (
    <Screen
      eyebrow={`Today · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`}
      title="Where did your time go?"
      description="Log what happened. No targets, no verdicts."
      refreshing={refreshing}
      onRefresh={() => void refresh()}>
      {!data && !error ? <ActivityIndicator color={theme.accent} size="large" /> : null}
      {error ? <Notice text={error} tone="error" onDismiss={() => setError(null)} /> : null}
      {message ? <Notice text={message} tone="success" onDismiss={() => setMessage(null)} /> : null}

      {data?.timer ? (
        <ActiveTimer
          timer={data.timer}
          elapsed={now - data.timer.startedAt}
          categoryById={categoryById}
          projectById={projectById}
          busy={busy}
          onStop={() => void stopTimer()}
        />
      ) : data ? (
        <View style={[styles.timerCard, { backgroundColor: theme.hero }]}>
          <ThemedText style={[styles.timerEyebrow, { color: theme.accent }]}>Start a timer</ThemedText>
          <ThemedText style={[styles.timerTitle, { color: theme.heroText }]}>What are you doing now?</ThemedText>
          <FieldLabel label="Activity title" dark>
            <TextInput
              value={timerLabel}
              onChangeText={setTimerLabel}
              placeholder="e.g. Project planning"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, styles.darkInput, { color: theme.heroText }]}
              maxLength={300}
            />
          </FieldLabel>
          <FieldLabel label="Category" dark>
            <ChoiceRow
              items={data.categories}
              selectedId={timerCategory || data.categories[0]?.id}
              onSelect={setTimerCategory}
              dark
            />
          </FieldLabel>
          <ProjectField projects={data.projects} value={timerProject} onChange={setTimerProject} dark />
          <Pressable onPress={() => setTimerSplit((value) => !value)}>
            <ThemedText style={{ color: theme.accent, fontWeight: '700' }}>
              {timerSplit ? '− Remove category split' : '+ Split between two categories'}
            </ThemedText>
          </Pressable>
          {timerSplit ? (
            <View style={styles.splitPanel}>
              <FieldLabel label="Second category" dark>
                <ChoiceRow
                  items={data.categories.filter((category) => category.id !== timerCategory)}
                  selectedId={timerCategory2}
                  onSelect={setTimerCategory2}
                  dark
                />
              </FieldLabel>
              <WeightPicker value={timerWeight} onChange={setTimerWeight} dark />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void startTimer()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent }, (pressed || busy) && styles.pressed]}>
            {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>▶ Start timer</ThemedText>}
          </Pressable>
        </View>
      ) : null}

      {data ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowFinished(true)}
            style={({ pressed }) => [styles.addCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && styles.pressed]}>
            <View style={[styles.addIcon, { backgroundColor: theme.backgroundSelected }]}><ThemedText style={styles.addIconText}>+</ThemedText></View>
            <View style={styles.flex}>
              <ThemedText style={styles.sectionTitle}>Add a finished block</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Log something that already happened</ThemedText>
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.sectionTitle}>Recent log</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">The latest 100 activities</ThemedText>
            </View>
            <Pressable onPress={() => void refresh()}><ThemedText style={{ color: theme.accent }}>Refresh</ThemedText></Pressable>
          </View>
          {groupedEntries.length ? groupedEntries.map((group) => (
            <View key={group.day} style={styles.dayGroup}>
              <View style={[styles.dayHeader, { borderBottomColor: theme.border }]}>
                <ThemedText type="smallBold">{group.day}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{formatDuration(group.minutes)}</ThemedText>
              </View>
              {group.entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  categoryById={categoryById}
                  projectById={projectById}
                  onDelete={() => confirmDelete(entry)}
                />
              ))}
            </View>
          )) : (
            <View style={[styles.emptyCard, { borderColor: theme.border }]}>
              <ThemedText style={styles.sectionTitle}>Nothing logged yet</ThemedText>
              <ThemedText themeColor="textSecondary">Start a timer or add your first finished block.</ThemedText>
            </View>
          )}
        </>
      ) : null}

      {data && showFinished ? (
        <FinishedEntryModal
          categories={data.categories}
          projects={data.projects}
          busy={busy}
          onClose={() => setShowFinished(false)}
          resolveProject={resolveProject}
          onSave={addFinishedEntry}
        />
      ) : null}
    </Screen>
  );
}

function ActiveTimer({ timer, elapsed, categoryById, projectById, busy, onStop }: {
  timer: DriftTimer;
  elapsed: number;
  categoryById: Map<string, DriftCategory>;
  projectById: Map<string, DriftProject>;
  busy: boolean;
  onStop: () => void;
}) {
  const theme = useTheme();
  const primary = categoryById.get(timer.category);
  const secondary = timer.category2 ? categoryById.get(timer.category2) : undefined;
  return (
    <View style={[styles.timerCard, { backgroundColor: theme.hero }]}>
      <ThemedText style={[styles.timerEyebrow, { color: theme.positive }]}>● Now</ThemedText>
      <ThemedText style={[styles.timerTitle, { color: theme.heroText }]}>{timer.label}</ThemedText>
      <View style={styles.tagRow}>
        {primary ? <Tag label={`${primary.name}${secondary ? ` ${Math.round(timer.weight * 100)}%` : ''}`} color={primary.color} dark /> : null}
        {secondary ? <Tag label={`${secondary.name} ${Math.round((1 - timer.weight) * 100)}%`} color={secondary.color} dark /> : null}
        {timer.projectId && projectById.get(timer.projectId) ? <Tag label={`◆ ${projectById.get(timer.projectId)?.name}`} dark /> : null}
      </View>
      <ThemedText style={[styles.clock, { color: theme.heroText }]}>{formatElapsed(elapsed)}</ThemedText>
      <Pressable disabled={busy} onPress={onStop} style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color="#242520" /> : <ThemedText style={{ color: '#242520', fontWeight: '800' }}>Stop and save</ThemedText>}
      </Pressable>
    </View>
  );
}

function EntryRow({ entry, categoryById, projectById, onDelete }: {
  entry: DriftEntry;
  categoryById: Map<string, DriftCategory>;
  projectById: Map<string, DriftProject>;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const primary = categoryById.get(entry.category);
  const secondary = entry.category2 ? categoryById.get(entry.category2) : undefined;
  const project = entry.projectId ? projectById.get(entry.projectId) : undefined;
  const minutes = Math.max(0, (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60_000);
  return (
    <View style={[styles.entryRow, { borderBottomColor: theme.border }]}>
      <View style={[styles.entryLine, { backgroundColor: primary?.color ?? theme.textSecondary }]} />
      <View style={styles.flex}>
        <ThemedText style={styles.entryTitle}>{entry.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatTime(entry.start)}–{formatTime(entry.end)} · {formatDuration(minutes)}
        </ThemedText>
        <View style={styles.tagRow}>
          {primary ? <Tag label={primary.name} color={primary.color} /> : null}
          {secondary ? <Tag label={secondary.name} color={secondary.color} /> : null}
          {project ? <Tag label={`◆ ${project.name}`} /> : null}
        </View>
      </View>
      <Pressable accessibilityLabel={`Delete ${entry.label}`} hitSlop={10} onPress={onDelete}>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 22 }}>•••</ThemedText>
      </Pressable>
    </View>
  );
}

function FinishedEntryModal({ categories, projects, busy, onClose, resolveProject, onSave }: {
  categories: DriftCategory[];
  projects: DriftProject[];
  busy: boolean;
  onClose: () => void;
  resolveProject: (name: string) => Promise<string | undefined>;
  onSave: (entry: Omit<DriftEntry, 'id'>) => Promise<void>;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState(categories[0]?.id || '');
  const [category2, setCategory2] = useState(categories[1]?.id || '');
  const [project, setProject] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [split, setSplit] = useState(false);
  const [weight, setWeight] = useState(80);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = localDefaults();
      setDate(next.date);
      setFrom(next.from);
      setTo(next.to);
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const submit = async () => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel || !category) {
      setFormError('Add an activity title and category.');
      return;
    }
    if (split && (!category2 || category2 === category)) {
      setFormError('Choose a different second category.');
      return;
    }
    const range = parseLocalRange(date, from, to);
    if (!range) {
      setFormError('Use a valid date and 24-hour times, for example 2026-10-30 and 09:30.');
      return;
    }
    setFormError(null);
    try {
      const projectId = await resolveProject(project);
      await onSave({
        label: normalizedLabel,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        category,
        category2: split ? category2 : undefined,
        weight: split ? weight / 100 : 1,
        note: note.trim() || undefined,
        projectId,
      });
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The activity could not be saved.');
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalPage, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <View style={styles.flex}>
              <ThemedText style={styles.modalTitle}>Add a finished block</ThemedText>
              <ThemedText themeColor="textSecondary">Record something that already happened.</ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><ThemedText style={styles.close}>×</ThemedText></Pressable>
          </View>
          {formError ? <Notice text={formError} tone="error" onDismiss={() => setFormError(null)} /> : null}
          <FieldLabel label="What happened?">
            <TextInput value={label} onChangeText={setLabel} placeholder="e.g. Park with the kids" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]} maxLength={300} />
          </FieldLabel>
          <FieldLabel label="Category">
            <ChoiceRow items={categories} selectedId={category} onSelect={setCategory} />
          </FieldLabel>
          <ProjectField projects={projects} value={project} onChange={setProject} />
          <View style={styles.timeGrid}>
            <FieldLabel label="Date"><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]} /></FieldLabel>
            <FieldLabel label="From"><TextInput value={from} onChangeText={setFrom} placeholder="HH:MM" keyboardType="numbers-and-punctuation" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]} /></FieldLabel>
            <FieldLabel label="To"><TextInput value={to} onChangeText={setTo} placeholder="HH:MM" keyboardType="numbers-and-punctuation" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]} /></FieldLabel>
          </View>
          <Pressable onPress={() => setSplit((value) => !value)}><ThemedText style={{ color: theme.accent, fontWeight: '700' }}>{split ? '− Remove category split' : '+ Split between two categories'}</ThemedText></Pressable>
          {split ? (
            <View style={[styles.formSplitPanel, { backgroundColor: theme.backgroundElement }]}>
              <FieldLabel label="Second category"><ChoiceRow items={categories.filter((item) => item.id !== category)} selectedId={category2} onSelect={setCategory2} /></FieldLabel>
              <WeightPicker value={weight} onChange={setWeight} />
            </View>
          ) : null}
          <FieldLabel label="Note (optional)">
            <TextInput value={note} onChangeText={setNote} multiline placeholder="Anything worth remembering?" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.noteInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]} />
          </FieldLabel>
          <Pressable disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent }, (pressed || busy) && styles.pressed]}>
            {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>Add to log</ThemedText>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProjectField({ projects, value, onChange, dark = false }: { projects: DriftProject[]; value: string; onChange: (value: string) => void; dark?: boolean }) {
  const theme = useTheme();
  const active = projects.filter((project) => !project.archived);
  return (
    <FieldLabel label="Project (optional)" dark={dark}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search or create a project"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, dark ? styles.darkInput : { borderColor: theme.border, backgroundColor: theme.backgroundElement }, { color: dark ? theme.heroText : theme.text }]}
        maxLength={120}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow} keyboardShouldPersistTaps="handled">
        {active.filter((project) => !value || project.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8).map((project) => (
          <Pressable key={project.id} onPress={() => onChange(project.name)} style={[styles.projectChip, { borderColor: dark ? '#ffffff38' : theme.border }, value === project.name && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            <ThemedText type="small" style={{ color: value === project.name ? '#fff' : dark ? theme.heroText : theme.text }}>{project.name}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </FieldLabel>
  );
}

function FieldLabel({ label, children, dark = false }: { label: string; children: React.ReactNode; dark?: boolean }) {
  const theme = useTheme();
  return <View style={styles.field}><ThemedText style={[styles.fieldLabel, dark && { color: theme.textSecondary }]}>{label}</ThemedText>{children}</View>;
}

function ChoiceRow({ items, selectedId, onSelect, dark = false }: { items: DriftCategory[]; selectedId?: string; onSelect: (id: string) => void; dark?: boolean }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {items.map((item) => {
        const selected = item.id === selectedId;
        return <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[styles.choiceChip, { borderColor: selected ? item.color : dark ? '#ffffff38' : theme.border, backgroundColor: selected ? `${item.color}33` : 'transparent' }]}><View style={[styles.dot, { backgroundColor: item.color }]} /><ThemedText type="small" style={{ color: dark ? theme.heroText : theme.text, fontWeight: selected ? '800' : '500' }}>{item.name}</ThemedText></Pressable>;
      })}
    </ScrollView>
  );
}

function WeightPicker({ value, onChange, dark = false }: { value: number; onChange: (weight: number) => void; dark?: boolean }) {
  const theme = useTheme();
  return <FieldLabel label={`Split ${value}/${100 - value}`} dark={dark}><View style={styles.weightRow}>{weights.map((weight) => <Pressable key={weight} onPress={() => onChange(weight)} style={[styles.weightChip, { borderColor: dark ? '#ffffff38' : theme.border }, weight === value && { backgroundColor: theme.accent, borderColor: theme.accent }]}><ThemedText type="small" style={{ color: weight === value ? '#fff' : dark ? theme.heroText : theme.text }}>{weight}/{100 - weight}</ThemedText></Pressable>)}</View></FieldLabel>;
}

function Notice({ text, tone, onDismiss }: { text: string; tone: 'error' | 'success'; onDismiss: () => void }) {
  const theme = useTheme();
  const color = tone === 'error' ? theme.accent : theme.positive;
  return <Pressable onPress={onDismiss} style={[styles.notice, { borderColor: color, backgroundColor: `${color}18` }]}><ThemedText style={{ color, flex: 1 }}>{text}</ThemedText><ThemedText style={{ color }}>×</ThemedText></Pressable>;
}

function Tag({ label, color, dark = false }: { label: string; color?: string; dark?: boolean }) {
  const theme = useTheme();
  return <View style={styles.tag}>{color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}<ThemedText style={{ color: dark ? theme.textSecondary : theme.textSecondary, fontSize: 12, lineHeight: 16 }}>{label}</ThemedText></View>;
}

function groupEntries(entries: DriftEntry[]) {
  const groups = new Map<string, { day: string; entries: DriftEntry[]; minutes: number }>();
  for (const entry of entries) {
    const day = new Date(entry.start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    const minutes = Math.max(0, (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60_000);
    const group = groups.get(day) ?? { day, entries: [], minutes: 0 };
    group.entries.push(entry);
    group.minutes += minutes;
    groups.set(day, group);
  }
  return [...groups.values()];
}

function localDefaults() {
  const now = new Date();
  const before = new Date(now.getTime() - 60 * 60_000);
  return { date: localDate(now), from: localTime(before), to: localTime(now) };
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseLocalRange(date: string, from: string, to: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const fromMatch = /^(\d{1,2}):(\d{2})$/.exec(from.trim());
  const toMatch = /^(\d{1,2}):(\d{2})$/.exec(to.trim());
  if (!dateMatch || !fromMatch || !toMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [fromHour, fromMinute] = fromMatch.slice(1).map(Number);
  const [toHour, toMinute] = toMatch.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || fromHour > 23 || toHour > 23 || fromMinute > 59 || toMinute > 59) return null;
  const start = new Date(year, month - 1, day, fromHour, fromMinute);
  const end = new Date(year, month - 1, day, toHour, toMinute);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(value: number) {
  const minutes = Math.max(0, Math.round(value));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatElapsed(value: number) {
  const seconds = Math.max(0, Math.floor(value / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const clock = [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
  return days ? `${days}d ${clock}` : clock;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.68 },
  timerCard: { borderRadius: 28, padding: Spacing.four, gap: Spacing.three },
  timerEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  timerTitle: { fontFamily: 'serif', fontSize: 30, lineHeight: 36, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 16 },
  darkInput: { borderColor: '#ffffff38', backgroundColor: '#ffffff0d' },
  field: { gap: Spacing.two },
  fieldLabel: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  choiceRow: { gap: Spacing.two, paddingRight: Spacing.three },
  choiceChip: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  projectChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  splitPanel: { borderTopWidth: 1, borderTopColor: '#ffffff24', paddingTop: Spacing.three, gap: Spacing.three },
  formSplitPanel: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  weightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  weightChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 10 },
  primaryButton: { minHeight: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  stopButton: { minHeight: 54, borderRadius: 14, backgroundColor: '#F8F4EC', alignItems: 'center', justifyContent: 'center' },
  clock: { fontSize: 36, lineHeight: 42, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  addCard: { minHeight: 86, borderWidth: 1, borderRadius: 20, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  addIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addIconText: { fontSize: 28, lineHeight: 32, fontWeight: '400' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  dayGroup: { gap: 0 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Spacing.two, borderBottomWidth: 1 },
  entryRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: 1 },
  entryLine: { width: 4, height: 52, borderRadius: 4 },
  entryTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, gap: Spacing.two },
  notice: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  modalPage: { flex: 1 },
  modalContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  modalTitle: { fontFamily: 'serif', fontSize: 32, lineHeight: 38, fontWeight: '700' },
  close: { fontSize: 34, lineHeight: 38 },
  timeGrid: { gap: Spacing.three },
  noteInput: { minHeight: 100, paddingTop: 13, textAlignVertical: 'top' },
});
