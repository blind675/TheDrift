import { getSupabase } from '@/lib/supabase';

export type DriftOverview = {
  categories: number;
  projects: number;
  entries: number;
};

export async function loadDriftOverview(userId: string): Promise<DriftOverview> {
  const client = getSupabase();
  const [categories, projects, entries] = await Promise.all([
    client.from('categories').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('entries').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  for (const result of [categories, projects, entries]) {
    if (result.error) throw result.error;
  }

  return {
    categories: categories.count ?? 0,
    projects: projects.count ?? 0,
    entries: entries.count ?? 0,
  };
}
