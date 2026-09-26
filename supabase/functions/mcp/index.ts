import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createMcpHandler,
  McpServer,
} from "npm:@modelcontextprotocol/server@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.3.6";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

const supabaseUrl = requiredSecret("SUPABASE_URL");
const serviceRoleKey = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
const driftUserId = requiredSecret("DRIFT_USER_ID");
const accessToken = requiredSecret("DRIFT_MCP_TOKEN");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allocationSchema = z.object({
  category_id: z.string().uuid(),
  weight: z.number().positive().max(1),
});

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function isAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization") || "";
  const alternate = request.headers.get("x-drift-mcp-key") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : alternate;
  if (supplied.length !== accessToken.length) return false;
  let different = 0;
  for (let index = 0; index < supplied.length; index += 1) {
    different |= supplied.charCodeAt(index) ^ accessToken.charCodeAt(index);
  }
  return different === 0;
}

async function validateReferences(
  projectId: string | null | undefined,
  allocations: Array<{ category_id: string; weight: number }>,
) {
  if (allocations.length < 1 || allocations.length > 2) {
    fail("An entry needs one or two category allocations.");
  }
  if (
    new Set(allocations.map((item) => item.category_id)).size !==
      allocations.length
  ) fail("Category allocations must be unique.");
  const total = allocations.reduce((sum, item) => sum + item.weight, 0);
  if (Math.abs(total - 1) > 0.001) fail("Allocation weights must add up to 1.");

  const { data: categories, error: categoryError } = await supabase
    .from("categories").select("id").eq("user_id", driftUserId).in(
      "id",
      allocations.map((item) => item.category_id),
    );
  if (categoryError) fail(categoryError.message);
  if ((categories || []).length !== allocations.length) {
    fail("One or more categories do not belong to this Drift account.");
  }

  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects").select("id").eq("user_id", driftUserId).eq(
        "id",
        projectId,
      ).maybeSingle();
    if (projectError) fail(projectError.message);
    if (!project) fail("The project does not belong to this Drift account.");
  }
}

async function insertEntry(input: {
  label: string;
  started_at: string;
  ended_at: string;
  note?: string | null;
  project_id?: string | null;
  allocations: Array<{ category_id: string; weight: number }>;
  source: "manual" | "timer";
}) {
  const startedAt = new Date(input.started_at);
  const endedAt = new Date(input.ended_at);
  if (
    !Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime())
  ) fail("Start and end must be valid ISO timestamps.");
  if (endedAt <= startedAt) fail("The end must be later than the start.");
  if (endedAt.getTime() - startedAt.getTime() > 365 * 86400000) {
    fail("An entry cannot be longer than 365 days.");
  }
  await validateReferences(input.project_id, input.allocations);

  const { data: entry, error: entryError } = await supabase.from("entries")
    .insert({
      user_id: driftUserId,
      label: input.label.trim(),
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      note: input.note?.trim() || null,
      project_id: input.project_id || null,
      source: input.source,
    }).select("id,label,started_at,ended_at,note,project_id,source").single();
  if (entryError) fail(entryError.message);

  const { error: allocationError } = await supabase.from("entry_allocations")
    .insert(
      input.allocations.map((item) => ({
        entry_id: entry.id,
        category_id: item.category_id,
        weight: item.weight,
      })),
    );
  if (allocationError) {
    await supabase.from("entries").delete().eq("id", entry.id).eq(
      "user_id",
      driftUserId,
    );
    fail(allocationError.message);
  }
  return { ...entry, allocations: input.allocations };
}

function interval(period: "today" | "7_days" | "30_days" | "all") {
  const end = new Date();
  if (period === "all") return { start: new Date(0), end, nominalDays: 0 };
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start, end, nominalDays: 1 };
  }
  const nominalDays = period === "7_days" ? 7 : 30;
  return {
    start: new Date(end.getTime() - nominalDays * 86400000),
    end,
    nominalDays,
  };
}

function overlapMinutes(
  startedAt: string,
  endedAt: string,
  start: Date,
  end: Date,
) {
  return Math.max(
    0,
    (Math.min(new Date(endedAt).getTime(), end.getTime()) -
      Math.max(new Date(startedAt).getTime(), start.getTime())) / 60000,
  );
}

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: "the-drift", version: "1.0.0" });

  server.registerTool("list_reference_data", {
    title: "List Drift categories and projects",
    description:
      "List the category and project IDs needed when creating or filtering Drift records.",
    inputSchema: z.object({
      include_archived_projects: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ include_archived_projects }) => {
    const [categoryResult, projectResult] = await Promise.all([
      supabase.from("categories").select("id,name,color,in_pie,sort_order").eq(
        "user_id",
        driftUserId,
      ).eq("archived", false).order("sort_order"),
      supabase.from("projects").select("id,name,archived").eq(
        "user_id",
        driftUserId,
      ).order("name"),
    ]);
    if (categoryResult.error) fail(categoryResult.error.message);
    if (projectResult.error) fail(projectResult.error.message);
    return json({
      categories: categoryResult.data,
      projects: (projectResult.data || []).filter((project) =>
        include_archived_projects || !project.archived
      ),
    });
  });

  server.registerTool("list_entries", {
    title: "List Drift entries",
    description:
      "List logged activities, optionally filtered by overlapping time range, category, or project.",
    inputSchema: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
      category_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ start, end, category_id, project_id, limit }) => {
    let query = supabase.from("entries")
      .select(
        "id,label,started_at,ended_at,note,source,project_id,entry_allocations(category_id,weight)",
      )
      .eq("user_id", driftUserId).order("started_at", { ascending: false })
      .limit(Math.min(500, category_id ? limit * 5 : limit));
    if (start) query = query.gt("ended_at", start);
    if (end) query = query.lt("started_at", end);
    if (project_id) query = query.eq("project_id", project_id);
    const { data, error } = await query;
    if (error) fail(error.message);
    const filtered = category_id
      ? (data || []).filter((entry) =>
        entry.entry_allocations?.some((item: { category_id: string }) =>
          item.category_id === category_id
        )
      ).slice(0, limit)
      : data;
    return json(filtered);
  });

  server.registerTool("get_drift_summary", {
    title: "Get a Drift summary",
    description:
      "Summarize logged hours, maintenance, discretionary coverage, projects, and intent-versus-actual share gaps. Entries crossing a boundary are clipped to the selected interval.",
    inputSchema: z.object({
      period: z.enum(["today", "7_days", "30_days", "all"]).default("7_days"),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ period }) => {
    const range = interval(period);
    const [entriesResult, categoriesResult, projectsResult, intentResult] =
      await Promise.all([
        supabase.from("entries").select(
          "id,started_at,ended_at,project_id,entry_allocations(category_id,weight)",
        ).eq("user_id", driftUserId).gt("ended_at", range.start.toISOString())
          .lt("started_at", range.end.toISOString()),
        supabase.from("categories").select("id,name,in_pie,sort_order").eq(
          "user_id",
          driftUserId,
        ).eq("archived", false),
        supabase.from("projects").select("id,name").eq("user_id", driftUserId),
        supabase.from("intent_versions").select(
          "id,steepness,intent_ranks(category_id,rank)",
        ).eq("user_id", driftUserId).order("effective_from", {
          ascending: false,
        }).limit(1).maybeSingle(),
      ]);
    for (
      const result of [
        entriesResult,
        categoriesResult,
        projectsResult,
        intentResult,
      ]
    ) if (result.error) fail(result.error.message);
    const entries = entriesResult.data || [];
    const categories = categoriesResult.data || [];
    const categoryMinutes = new Map<string, number>();
    const projectMinutes = new Map<string, number>();
    const entryDays = new Set<string>();
    for (const entry of entries) {
      const minutes = overlapMinutes(
        entry.started_at,
        entry.ended_at,
        range.start,
        range.end,
      );
      for (const allocation of entry.entry_allocations || []) {
        categoryMinutes.set(
          allocation.category_id,
          (categoryMinutes.get(allocation.category_id) || 0) +
            minutes * Number(allocation.weight),
        );
      }
      if (entry.project_id) {
        projectMinutes.set(
          entry.project_id,
          (projectMinutes.get(entry.project_id) || 0) + minutes,
        );
      }
      const cursor = new Date(
        Math.max(new Date(entry.started_at).getTime(), range.start.getTime()),
      );
      const last = new Date(
        Math.min(new Date(entry.ended_at).getTime(), range.end.getTime()) - 1,
      );
      cursor.setHours(0, 0, 0, 0);
      last.setHours(0, 0, 0, 0);
      while (cursor <= last) {
        entryDays.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    const discretionary = categories.filter((category) => category.in_pie);
    const discretionaryMinutes = discretionary.reduce(
      (sum, category) => sum + (categoryMinutes.get(category.id) || 0),
      0,
    );
    const maintenanceMinutes = categories.filter((category) => !category.in_pie)
      .reduce(
        (sum, category) => sum + (categoryMinutes.get(category.id) || 0),
        0,
      );
    const oldest = entries.length
      ? Math.min(
        ...entries.map((entry) => new Date(entry.started_at).getTime()),
      )
      : Date.now();
    const coverageDays = range.nominalDays ||
      Math.max(1, Math.floor((Date.now() - oldest) / 86400000) + 1);
    const ranks = [...(intentResult.data?.intent_ranks || [])].sort((a, b) =>
      a.rank - b.rank
    );
    const steepness = Number(intentResult.data?.steepness ?? 1);
    const weights = ranks.map((_, index) =>
      steepness === 0 ? 1 : Math.pow(ranks.length - index, steepness)
    );
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const targets = new Map(
      ranks.map((
        rank,
        index,
      ) => [rank.category_id, weightTotal ? weights[index] / weightTotal : 0]),
    );
    const categoryRows = discretionary.map((category) => {
      const minutes = categoryMinutes.get(category.id) || 0;
      const actualShare = discretionaryMinutes
        ? minutes / discretionaryMinutes
        : 0;
      const targetShare = targets.get(category.id) || 0;
      return {
        id: category.id,
        name: category.name,
        hours: minutes / 60,
        actual_share: actualShare,
        intended_share: targetShare,
        gap_percentage_points: (actualShare - targetShare) * 100,
      };
    });
    return json({
      period,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      discretionary_hours: discretionaryMinutes / 60,
      maintenance_hours: maintenanceMinutes / 60,
      maintenance_hours_per_logged_day: maintenanceMinutes / 60 /
        Math.max(1, entryDays.size),
      coverage_percent: Math.min(
        100,
        discretionaryMinutes / (coverageDays * 12 * 60) * 100,
      ),
      days_with_entries: entryDays.size,
      categories: categoryRows,
      projects: (projectsResult.data || []).map((project) => ({
        ...project,
        hours: (projectMinutes.get(project.id) || 0) / 60,
      })).filter((project) => project.hours > 0).sort((a, b) =>
        b.hours - a.hours
      ),
    });
  });

  server.registerTool("create_entry", {
    title: "Create a Drift entry",
    description:
      "Create a completed activity. Use list_reference_data first to obtain category and project IDs.",
    inputSchema: z.object({
      label: z.string().trim().min(1).max(300),
      started_at: z.string().datetime(),
      ended_at: z.string().datetime(),
      note: z.string().max(5000).optional(),
      project_id: z.string().uuid().nullable().optional(),
      allocations: z.array(allocationSchema).min(1).max(2),
    }),
  }, async (input) => json(await insertEntry({ ...input, source: "manual" })));

  server.registerTool("create_project", {
    title: "Create a Drift project",
    description: "Create a reusable project for the configured Drift account.",
    inputSchema: z.object({ name: z.string().trim().min(1).max(120) }),
  }, async ({ name }) => {
    const normalized = name.trim().replace(/\s+/g, " ");
    const { data, error } = await supabase.from("projects").insert({
      user_id: driftUserId,
      name: normalized,
    }).select("id,name,archived").single();
    if (error?.code === "23505") {
      const { data: existing, error: lookupError } = await supabase.from(
        "projects",
      ).select("id,name,archived").eq("user_id", driftUserId).eq(
        "archived",
        false,
      ).ilike("name", normalized).limit(1).single();
      if (lookupError) fail(lookupError.message);
      return json(existing);
    }
    if (error) fail(error.message);
    return json(data);
  });

  server.registerTool("delete_entry", {
    title: "Delete a Drift entry",
    description:
      "Permanently delete one logged activity. Confirm the exact activity with the user before calling.",
    inputSchema: z.object({ entry_id: z.string().uuid() }),
    annotations: { destructiveHint: true },
  }, async ({ entry_id }) => {
    const { data, error } = await supabase.from("entries").delete().eq(
      "user_id",
      driftUserId,
    ).eq("id", entry_id).select("id").maybeSingle();
    if (error) fail(error.message);
    if (!data) fail("Entry not found.");
    return json({ deleted: true, entry_id });
  });

  server.registerTool("get_running_timer", {
    title: "Get the running Drift timer",
    description: "Return the currently running timer, if there is one.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => {
    const { data, error } = await supabase.from("running_timer").select(
      "label,started_at,draft",
    ).eq("user_id", driftUserId).maybeSingle();
    if (error) fail(error.message);
    return json(data);
  });

  server.registerTool("start_timer", {
    title: "Start a Drift timer",
    description:
      "Start or replace the running timer with a title, project, and one or two category allocations.",
    inputSchema: z.object({
      label: z.string().trim().min(1).max(300),
      started_at: z.string().datetime().optional(),
      project_id: z.string().uuid().nullable().optional(),
      allocations: z.array(allocationSchema).min(1).max(2),
    }),
  }, async ({ label, started_at, project_id, allocations }) => {
    await validateReferences(project_id, allocations);
    const { error } = await supabase.from("running_timer").upsert({
      user_id: driftUserId,
      label: label.trim(),
      started_at: started_at || new Date().toISOString(),
      draft: { project_id: project_id || null, allocations },
    });
    if (error) fail(error.message);
    return json({
      started: true,
      label,
      started_at: started_at || "now",
      project_id: project_id || null,
      allocations,
    });
  });

  server.registerTool("stop_timer", {
    title: "Stop and record the Drift timer",
    description: "Stop the running timer and turn it into a logged activity.",
    inputSchema: z.object({
      ended_at: z.string().datetime().optional(),
      label: z.string().trim().min(1).max(300).optional(),
    }),
  }, async ({ ended_at, label }) => {
    const { data: timer, error } = await supabase.from("running_timer").select(
      "label,started_at,draft",
    ).eq("user_id", driftUserId).maybeSingle();
    if (error) fail(error.message);
    if (!timer) fail("There is no running timer.");
    const draft = (timer.draft || {}) as {
      project_id?: string | null;
      allocations?: Array<{ category_id: string; weight: number }>;
      category_id?: string;
      category2_id?: string;
      weight?: number;
    };
    const allocations = draft.allocations || (draft.category_id
      ? [
        {
          category_id: draft.category_id,
          weight: draft.category2_id ? Number(draft.weight ?? 0.5) : 1,
        },
        ...(draft.category2_id
          ? [{
            category_id: draft.category2_id,
            weight: 1 - Number(draft.weight ?? 0.5),
          }]
          : []),
      ]
      : []);
    const entry = await insertEntry({
      label: label || timer.label || "Focused time",
      started_at: timer.started_at,
      ended_at: ended_at || new Date().toISOString(),
      project_id: draft.project_id || null,
      allocations,
      source: "timer",
    });
    const { error: clearError } = await supabase.from("running_timer").delete()
      .eq("user_id", driftUserId);
    if (clearError) {
      fail(
        `The entry was created, but the timer could not be cleared: ${clearError.message}`,
      );
    }
    return json(entry);
  });

  return server;
});

Deno.serve(async (request) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": "Bearer",
      },
    });
  }
  return handler.fetch(request);
});
