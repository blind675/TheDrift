export function deriveTargetShares(order: string[], steepness: number): Record<string, number> {
  if (!order.length) return {};
  const weights = order.map((_, i) => steepness === 0 ? 1 : Math.pow(order.length - i, steepness));
  const total = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(order.map((id, i) => [id, weights[i] / total]));
}

export function weightedMinutes(startedAt: string, endedAt: string, weight = 1): number {
  return Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000) * weight;
}

export function coverage(totalLoggedMinutes: number, days: number): number {
  return days <= 0 ? 0 : totalLoggedMinutes / (days * 16 * 60);
}
