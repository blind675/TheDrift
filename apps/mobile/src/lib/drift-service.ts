import { getSupabase } from '@/lib/supabase';

export type DriftCategory = { id: string; name: string; color: string; inPie: boolean };
export type DriftProject = { id: string; name: string; archived: boolean };
export type DriftEntry = {
  id: string;
  label: string;
  start: string;
  end: string;
  category: string;
  category2?: string;
  weight: number;
  note?: string;
  projectId?: string;
};
export type DriftTimer = {
  label: string;
  category: string;
  category2?: string;
  weight: number;
  projectId?: string;
  startedAt: number;
};
export type DriftLogData = {
  categories: DriftCategory[];
  projects: DriftProject[];
  entries: DriftEntry[];
  timer: DriftTimer | null;
};
export type DriftAnalyticsData = {
  categories: DriftCategory[];
  projects: DriftProject[];
  entries: DriftEntry[];
  steepness: number;
};

type EntryInput = Omit<DriftEntry, 'id'>;

export async function loadDriftLog(userId: string): Promise<DriftLogData> {
  const client = getSupabase();
  const [categoriesResult, projectsResult, entriesResult, timerResult] = await Promise.all([
    client.from('categories').select('id,name,color,in_pie,sort_order').eq('user_id', userId).eq('archived', false).order('sort_order'),
    client.from('projects').select('id,name,archived').eq('user_id', userId).order('name'),
    client
      .from('entries')
      .select('id,label,started_at,ended_at,note,project_id,entry_allocations(category_id,weight)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(100),
    client.from('running_timer').select('label,started_at,draft').eq('user_id', userId).maybeSingle(),
  ]);

  for (const result of [categoriesResult, projectsResult, entriesResult, timerResult]) {
    if (result.error) throw result.error;
  }

  const categories: DriftCategory[] = (categoriesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    inPie: row.in_pie,
  }));
  const projects: DriftProject[] = (projectsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    archived: row.archived,
  }));
  const entries: DriftEntry[] = (entriesResult.data ?? []).flatMap((row) => {
    const allocations = [...(row.entry_allocations ?? [])].sort((a, b) => Number(b.weight) - Number(a.weight));
    if (!allocations[0]) return [];
    return [{
      id: row.id,
      label: row.label || 'Untitled',
      start: row.started_at,
      end: row.ended_at,
      category: allocations[0].category_id,
      category2: allocations[1]?.category_id,
      weight: Number(allocations[0].weight),
      note: row.note || undefined,
      projectId: row.project_id || undefined,
    }];
  });

  const draft = timerResult.data?.draft as {
    category_id?: string;
    category2_id?: string;
    weight?: number;
    project_id?: string;
  } | null;
  const timer: DriftTimer | null = timerResult.data
    ? {
        label: timerResult.data.label || 'Focused time',
        category: draft?.category_id || categories[0]?.id || '',
        category2: draft?.category2_id || undefined,
        weight: Number(draft?.weight ?? 1),
        projectId: draft?.project_id || undefined,
        startedAt: new Date(timerResult.data.started_at).getTime(),
      }
    : null;

  return { categories, projects, entries, timer };
}

export async function loadDriftAnalytics(userId: string): Promise<DriftAnalyticsData> {
  const client = getSupabase();
  const [categoriesResult, projectsResult, intentResult, entries] = await Promise.all([
    client.from('categories').select('id,name,color,in_pie,sort_order').eq('user_id', userId).eq('archived', false).order('sort_order'),
    client.from('projects').select('id,name,archived').eq('user_id', userId).order('name'),
    client
      .from('intent_versions')
      .select('steepness,intent_ranks(category_id,rank)')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadAllEntries(userId),
  ]);

  for (const result of [categoriesResult, projectsResult, intentResult]) {
    if (result.error) throw result.error;
  }

  const rankByCategory = new Map<string, number>();
  for (const rank of intentResult.data?.intent_ranks ?? []) {
    rankByCategory.set(rank.category_id, rank.rank);
  }
  const categories = (categoriesResult.data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      inPie: row.in_pie,
      sortOrder: row.sort_order,
    }))
    .sort((a, b) => (rankByCategory.get(a.id) ?? 10_000 + a.sortOrder) - (rankByCategory.get(b.id) ?? 10_000 + b.sortOrder))
    .map(({ sortOrder: _sortOrder, ...category }) => category);
  const projects: DriftProject[] = (projectsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    archived: row.archived,
  }));

  return {
    categories,
    projects,
    entries,
    steepness: Number(intentResult.data?.steepness ?? 1),
  };
}

async function loadAllEntries(userId: string): Promise<DriftEntry[]> {
  const client = getSupabase();
  const pageSize = 1000;
  const entries: DriftEntry[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('entries')
      .select('id,label,started_at,ended_at,note,project_id,entry_allocations(category_id,weight)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    entries.push(...mapEntryRows(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return entries;
}

function mapEntryRows(rows: {
  id: string;
  label: string | null;
  started_at: string;
  ended_at: string;
  note: string | null;
  project_id: string | null;
  entry_allocations: { category_id: string; weight: number | string }[];
}[]): DriftEntry[] {
  return rows.flatMap((row) => {
    const allocations = [...(row.entry_allocations ?? [])].sort((a, b) => Number(b.weight) - Number(a.weight));
    if (!allocations[0]) return [];
    return [{
      id: row.id,
      label: row.label || 'Untitled',
      start: row.started_at,
      end: row.ended_at,
      category: allocations[0].category_id,
      category2: allocations[1]?.category_id,
      weight: Number(allocations[0].weight),
      note: row.note || undefined,
      projectId: row.project_id || undefined,
    }];
  });
}

export async function createEntry(userId: string, entry: EntryInput, source: 'manual' | 'timer' = 'manual'): Promise<DriftEntry> {
  const client = getSupabase();
  const { data, error } = await client
    .from('entries')
    .insert({
      user_id: userId,
      label: entry.label.trim(),
      started_at: entry.start,
      ended_at: entry.end,
      note: entry.note?.trim() || null,
      project_id: entry.projectId || null,
      source,
    })
    .select('id')
    .single();
  if (error) throw error;

  const allocations = entry.category2
    ? [
        { entry_id: data.id, category_id: entry.category, weight: entry.weight },
        { entry_id: data.id, category_id: entry.category2, weight: 1 - entry.weight },
      ]
    : [{ entry_id: data.id, category_id: entry.category, weight: 1 }];
  const { error: allocationError } = await client.from('entry_allocations').insert(allocations);
  if (allocationError) {
    await client.from('entries').delete().eq('id', data.id).eq('user_id', userId);
    throw allocationError;
  }
  return { ...entry, id: data.id };
}

export async function deleteEntry(userId: string, entryId: string): Promise<void> {
  const { data, error } = await getSupabase().from('entries').delete().eq('id', entryId).eq('user_id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The record could not be found or deleted.');
}

export async function createProject(userId: string, rawName: string): Promise<DriftProject> {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Project name cannot be empty.');
  const client = getSupabase();
  const { data, error } = await client.from('projects').insert({ user_id: userId, name }).select('id,name,archived').single();
  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await client
      .from('projects')
      .select('id,name,archived')
      .eq('user_id', userId)
      .eq('archived', false)
      .ilike('name', name)
      .limit(1)
      .single();
    if (lookupError) throw lookupError;
    return existing;
  }
  if (error) throw error;
  return data;
}

export async function saveRunningTimer(userId: string, timer: DriftTimer): Promise<void> {
  const { error } = await getSupabase().from('running_timer').upsert({
    user_id: userId,
    label: timer.label.trim(),
    started_at: new Date(timer.startedAt).toISOString(),
    draft: {
      category_id: timer.category,
      category2_id: timer.category2 || null,
      weight: timer.category2 ? timer.weight : 1,
      project_id: timer.projectId || null,
    },
  });
  if (error) throw error;
}

export async function clearRunningTimer(userId: string): Promise<void> {
  const { error } = await getSupabase().from('running_timer').delete().eq('user_id', userId);
  if (error) throw error;
}
