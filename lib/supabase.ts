import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

export type DriftCategory = { id: string; name: string; color: string; inPie: boolean };
export type DriftProject = { id: string; name: string; archived: boolean };
export type DriftEntry = { id: string; label: string; start: string; end: string; category: string; category2?: string; weight: number; note?: string; projectId?: string };
export type DriftTimer = { label: string; category: string; projectId?: string; startedAt: number };
export type DriftData = { categories: DriftCategory[]; projects: DriftProject[]; entries: DriftEntry[]; steepness: number; timer: DriftTimer | null };
export type AuthSession = Session;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured. Add the project URL and publishable key to .env, then restart the app.");
  }
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

export async function requestMagicLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuth(callback: (session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    // Run data requests after Supabase releases its internal auth lock.
    setTimeout(() => callback(session), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function loadDriftData(userId: string): Promise<DriftData> {
  const client = getSupabase();
  const [categoriesResult, projectsResult, entriesResult, intentResult, timerResult] = await Promise.all([
    client.from("categories").select("id,name,color,in_pie,sort_order").eq("user_id", userId).eq("archived", false).order("sort_order"),
    client.from("projects").select("id,name,archived").eq("user_id", userId).order("name"),
    client.from("entries").select("id,label,started_at,ended_at,note,project_id,entry_allocations(category_id,weight)").eq("user_id", userId).order("started_at", { ascending: false }),
    client.from("intent_versions").select("id,steepness,intent_ranks(category_id,rank)").eq("user_id", userId).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    client.from("running_timer").select("label,started_at,draft").eq("user_id", userId).maybeSingle(),
  ]);

  for (const result of [categoriesResult, projectsResult, entriesResult, intentResult, timerResult]) {
    if (result.error) throw result.error;
  }

  const rankByCategory = new Map<string, number>();
  for (const rank of intentResult.data?.intent_ranks || []) rankByCategory.set(rank.category_id, rank.rank);
  const categories = (categoriesResult.data || [])
    .map(row => ({ id: row.id, name: row.name, color: row.color, inPie: row.in_pie, sortOrder: row.sort_order }))
    .sort((a, b) => (rankByCategory.get(a.id) ?? 10_000 + a.sortOrder) - (rankByCategory.get(b.id) ?? 10_000 + b.sortOrder))
    .map(category => ({ id: category.id, name: category.name, color: category.color, inPie: category.inPie }));

  const entries: DriftEntry[] = (entriesResult.data || []).flatMap(row => {
    const allocations = [...(row.entry_allocations || [])].sort((a, b) => Number(b.weight) - Number(a.weight));
    if (!allocations[0]) return [];
    return [{
      id: row.id,
      label: row.label || "Untitled",
      start: row.started_at,
      end: row.ended_at,
      category: allocations[0].category_id,
      category2: allocations[1]?.category_id,
      weight: Number(allocations[0].weight),
      note: row.note || undefined,
      projectId: row.project_id || undefined,
    }];
  });

  const projects: DriftProject[] = (projectsResult.data || []).map(row => ({ id: row.id, name: row.name, archived: row.archived }));
  const timerDraft = timerResult.data?.draft as { category_id?: string; project_id?: string } | null;
  return {
    categories,
    projects,
    entries,
    steepness: Number(intentResult.data?.steepness ?? 1),
    timer: timerResult.data ? {
      label: timerResult.data.label || "Focused time",
      category: timerDraft?.category_id || categories[0]?.id || "",
      projectId: timerDraft?.project_id || undefined,
      startedAt: new Date(timerResult.data.started_at).getTime(),
    } : null,
  };
}

export async function createEntry(userId: string, entry: DriftEntry, source: "manual" | "timer" = "manual"): Promise<DriftEntry> {
  const client = getSupabase();
  const { data, error } = await client.from("entries").insert({
    id: entry.id,
    user_id: userId,
    label: entry.label,
    started_at: entry.start,
    ended_at: entry.end,
    note: entry.note || null,
    project_id: entry.projectId || null,
    source,
  }).select("id").single();
  if (error) throw error;

  const allocations = entry.category2
    ? [{ entry_id: data.id, category_id: entry.category, weight: entry.weight }, { entry_id: data.id, category_id: entry.category2, weight: 1 - entry.weight }]
    : [{ entry_id: data.id, category_id: entry.category, weight: 1 }];
  const { error: allocationError } = await client.from("entry_allocations").insert(allocations);
  if (allocationError) {
    await client.from("entries").delete().eq("id", data.id).eq("user_id", userId);
    throw allocationError;
  }
  return { ...entry, id: data.id };
}

export async function createProject(userId: string, name: string): Promise<DriftProject> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName) throw new Error("Project name cannot be empty.");
  const client = getSupabase();
  const { data, error } = await client.from("projects").insert({ user_id: userId, name: normalizedName }).select("id,name,archived").single();
  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await client.from("projects").select("id,name,archived").eq("user_id", userId).eq("archived", false).ilike("name", normalizedName).limit(1).single();
    if (lookupError) throw lookupError;
    return { id: existing.id, name: existing.name, archived: existing.archived };
  }
  if (error) throw error;
  return { id: data.id, name: data.name, archived: data.archived };
}

export async function deleteEntry(userId: string, entryId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The record could not be found or you do not have permission to delete it.");
}

export async function saveRunningTimer(userId: string, timer: DriftTimer): Promise<void> {
  const { error } = await getSupabase().from("running_timer").upsert({
    user_id: userId,
    label: timer.label,
    started_at: new Date(timer.startedAt).toISOString(),
    draft: { category_id: timer.category, project_id: timer.projectId || null },
  });
  if (error) throw error;
}

export async function clearRunningTimer(userId: string): Promise<void> {
  const { error } = await getSupabase().from("running_timer").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function saveIntent(userId: string, categories: DriftCategory[], steepness: number): Promise<void> {
  const client = getSupabase();
  const ranked = categories.filter(category => category.inPie);
  const { data, error } = await client.from("intent_versions").insert({ user_id: userId, steepness }).select("id").single();
  if (error) throw error;
  const { error: ranksError } = await client.from("intent_ranks").insert(ranked.map((category, index) => ({
    intent_id: data.id,
    category_id: category.id,
    rank: index + 1,
  })));
  if (ranksError) {
    await client.from("intent_versions").delete().eq("id", data.id).eq("user_id", userId);
    throw ranksError;
  }
}
