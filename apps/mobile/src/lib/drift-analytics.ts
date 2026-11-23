import type { DriftAnalyticsData, DriftCategory, DriftEntry, DriftProject } from '@/lib/drift-service';

export type DriftWindow = 'today' | '7days' | '30days' | 'all';

export type DriftCategoryRow = {
  category: DriftCategory;
  intendedRank: number;
  actualRank: number;
  actualShare: number;
  intendedShare: number;
  gap: number;
  hours: number;
};

export type DriftProjectRow = {
  project: DriftProject;
  minutes: number;
  share: number;
};

export type DriftReport = {
  rows: DriftCategoryRow[];
  projectRows: DriftProjectRow[];
  discretionaryMinutes: number;
  maintenanceMinutesPerDay: number;
  projectMinutes: number;
  daysWithEntries: number;
  coverage: number;
  coverageMessage: string;
};

export function buildDriftReport(data: DriftAnalyticsData, window: DriftWindow, now: number): DriftReport {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const earliestEntry = data.entries.length
    ? Math.min(...data.entries.map((entry) => new Date(entry.start).getTime()))
    : todayStart.getTime();
  const rangeStart = window === 'today'
    ? todayStart.getTime()
    : window === '7days'
      ? now - 7 * 86_400_000
      : window === '30days'
        ? now - 30 * 86_400_000
        : earliestEntry;
  const visible = data.entries.filter((entry) => {
    const start = new Date(entry.start).getTime();
    const end = new Date(entry.end).getTime();
    return end > rangeStart && start < now;
  });

  const minutesInRange = (entry: DriftEntry) => Math.max(
    0,
    (Math.min(new Date(entry.end).getTime(), now) - Math.max(new Date(entry.start).getTime(), rangeStart)) / 60_000,
  );
  const totals: Record<string, number> = {};
  for (const entry of visible) {
    const minutes = minutesInRange(entry);
    totals[entry.category] = (totals[entry.category] ?? 0) + minutes * entry.weight;
    if (entry.category2) {
      totals[entry.category2] = (totals[entry.category2] ?? 0) + minutes * (1 - entry.weight);
    }
  }

  const valueCategories = data.categories.filter((category) => category.inPie);
  const intendedShares = deriveTargetShares(valueCategories.map((category) => category.id), data.steepness);
  const discretionaryMinutes = valueCategories.reduce((total, category) => total + (totals[category.id] ?? 0), 0);
  const actualShares = Object.fromEntries(valueCategories.map((category) => [
    category.id,
    discretionaryMinutes ? (totals[category.id] ?? 0) / discretionaryMinutes : 0,
  ]));
  const actualOrder = [...valueCategories]
    .filter((category) => actualShares[category.id] > 0)
    .sort((a, b) => actualShares[b.id] - actualShares[a.id]);
  const rows = valueCategories.map((category, index) => ({
    category,
    intendedRank: index + 1,
    actualRank: actualOrder.findIndex((item) => item.id === category.id) + 1,
    actualShare: actualShares[category.id],
    intendedShare: intendedShares[category.id] ?? 0,
    gap: actualShares[category.id] - (intendedShares[category.id] ?? 0),
    hours: (totals[category.id] ?? 0) / 60,
  }));

  const entryDays = new Set<string>();
  for (const entry of visible) {
    const clippedStart = new Date(Math.max(new Date(entry.start).getTime(), rangeStart));
    const clippedEnd = new Date(Math.min(new Date(entry.end).getTime(), now) - 1);
    clippedStart.setHours(0, 0, 0, 0);
    clippedEnd.setHours(0, 0, 0, 0);
    while (clippedStart <= clippedEnd) {
      entryDays.add(clippedStart.toDateString());
      clippedStart.setDate(clippedStart.getDate() + 1);
    }
  }
  const daysWithEntries = entryDays.size;
  const maintenance = data.categories.find((category) => category.name.toLocaleLowerCase() === 'maintenance');
  const maintenanceMinutes = maintenance ? totals[maintenance.id] ?? 0 : 0;

  const firstActivityDay = visible.length
    ? new Date(Math.min(...visible.map((entry) => Math.max(new Date(entry.start).getTime(), rangeStart))))
    : new Date(todayStart);
  firstActivityDay.setHours(0, 0, 0, 0);
  const allActivityDays = Math.max(1, Math.round((todayStart.getTime() - firstActivityDay.getTime()) / 86_400_000) + 1);
  const coverageDays = window === 'today' ? 1 : window === '7days' ? 7 : window === '30days' ? 30 : allActivityDays;
  const totalLoggedMinutes = coveredMinutes(visible, rangeStart, now);
  const coverage = Math.min(100, Math.round(totalLoggedMinutes / (coverageDays * 1440) * 100));

  const projectTotals: Record<string, number> = {};
  for (const entry of visible) {
    if (entry.projectId) projectTotals[entry.projectId] = (projectTotals[entry.projectId] ?? 0) + minutesInRange(entry);
  }
  const projectMinutes = Object.values(projectTotals).reduce((sum, minutes) => sum + minutes, 0);
  const projectRows = data.projects
    .map((project) => ({
      project,
      minutes: projectTotals[project.id] ?? 0,
      share: projectMinutes ? (projectTotals[project.id] ?? 0) / projectMinutes : 0,
    }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const coverageMessage = coverage < 25
    ? `You accounted for ${coverage}% of the full 24 hours per day, including Maintenance. Rank movement is more reliable than exact hour comparisons while coverage is light.`
    : coverage < 70
      ? `You accounted for ${coverage}% of the full 24 hours per day, including Maintenance. Share gaps are useful, but some time remains untracked.`
      : `You accounted for ${coverage}% of the full 24 hours per day, including Maintenance, giving this comparison strong coverage.`;

  return {
    rows,
    projectRows,
    discretionaryMinutes,
    maintenanceMinutesPerDay: maintenanceMinutes / Math.max(1, daysWithEntries),
    projectMinutes,
    daysWithEntries,
    coverage,
    coverageMessage,
  };
}

function coveredMinutes(entries: DriftEntry[], rangeStart: number, rangeEnd: number) {
  const ranges = entries
    .map((entry) => [
      Math.max(new Date(entry.start).getTime(), rangeStart),
      Math.min(new Date(entry.end).getTime(), rangeEnd),
    ] as const)
    .filter(([start, end]) => end > start)
    .sort(([startA], [startB]) => startA - startB);
  if (!ranges.length) return 0;

  let covered = 0;
  let [currentStart, currentEnd] = ranges[0];
  for (const [start, end] of ranges.slice(1)) {
    if (start <= currentEnd) currentEnd = Math.max(currentEnd, end);
    else {
      covered += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  return (covered + currentEnd - currentStart) / 60_000;
}

function deriveTargetShares(order: string[], steepness: number): Record<string, number> {
  if (!order.length) return {};
  const weights = order.map((_, index) => steepness === 0 ? 1 : Math.pow(order.length - index, steepness));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(order.map((id, index) => [id, weights[index] / total]));
}
