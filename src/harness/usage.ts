// Usage for the Status page: the plan's own meter (from Claude Code's /usage) and Gabo's per-run log.

export interface PlanUsage { label: string; percent: number; resets: string }

/** Reads lines like "Current session: 88% used · resets Sep 30, 10:09pm (Asia/Taipei)". */
export function parsePlanUsage(text: string): PlanUsage[] {
  const out: PlanUsage[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(Current [^:]+):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·•-]\s*resets\s*(.+))?\s*$/i.exec(line);
    if (m) out.push({ label: m[1].trim(), percent: Number(m[2]), resets: (m[3] ?? "").trim() });
  }
  return out;
}

export interface UsageRecord { at: number; room: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }
export interface Totals { runs: number; tokens: number; costUsd: number }
export interface Grouped extends Totals { key: string }

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 10_000) / 10_000;

function total(recs: UsageRecord[]): Totals {
  return {
    runs: recs.length,
    tokens: recs.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
    costUsd: round(recs.reduce((n, r) => n + r.costUsd, 0)),
  };
}

function groupBy(recs: UsageRecord[], key: (r: UsageRecord) => string): Grouped[] {
  const map = new Map<string, UsageRecord[]>();
  for (const r of recs) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.entries()].map(([k, rs]) => ({ key: k, ...total(rs) })).sort((a, b) => b.tokens - a.tokens);
}

/** Today (since local midnight) and the last 7 days, plus the week split by room and by model. */
export function summarizeUsage(recs: UsageRecord[], now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = recs.filter((r) => r.at >= midnight.getTime() && r.at <= now);
  const week = recs.filter((r) => r.at >= now - 7 * DAY && r.at <= now);
  return { today: total(today), week: total(week), byRoom: groupBy(week, (r) => r.room), byModel: groupBy(week, (r) => r.model || "unknown") };
}
