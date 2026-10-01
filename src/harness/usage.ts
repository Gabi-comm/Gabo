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

export interface UsageRecord {
  at: number; room: string; model: string; inputTokens: number; outputTokens: number; costUsd: number;
  /** Tokens re-read from the prompt cache, and written to it. Absent on lines logged before 2026-10-01. */
  cacheReadTokens?: number; cacheWriteTokens?: number;
}
export interface Totals { runs: number; tokens: number; costUsd: number }
export interface Grouped extends Totals { key: string }

const DAY = 86_400_000;

/** Every token a run used: fresh input, cache writes, cache reads and output. */
export const tokensOf = (r: UsageRecord) => r.inputTokens + r.outputTokens + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0);
const round = (n: number) => Math.round(n * 10_000) / 10_000;

function total(recs: UsageRecord[]): Totals {
  return {
    runs: recs.length,
    tokens: recs.reduce((n, r) => n + tokensOf(r), 0),
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

type Counts = { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number };

/**
 * What one run used. Claude Code reports a running total for the session (and a resumed session starts
 * from the total it saved), so a run is that total minus the session's previous total. With no previous
 * total, a brand-new session's total is the run; a session resumed for the first time in Gabo only counts
 * this turn's main loop, so the whole earlier history isn't logged as one run.
 */
export function runUsage(total: Counts | undefined, prev: Counts | undefined, turn: Counts, resumed: boolean): Counts {
  if (!total) return turn;
  if (prev) {
    const keys = ["input", "output", "cacheRead", "cacheWrite", "costUsd"] as const;
    // A total below the last one means the session was cleared: the new total is all new.
    if (keys.every((k) => total[k] >= prev[k])) return Object.fromEntries(keys.map((k) => [k, Math.max(0, total[k] - prev[k])])) as Counts;
    return total;
  }
  return resumed ? { ...turn, costUsd: 0 } : total;
}

export interface DayUsage { date: string; label: string; input: number; cacheWrite: number; cacheRead: number; output: number; total: number; runs: number; costUsd: number }

export interface WeeklyAnalytics {
  days: DayUsage[];
  total: number;
  split: { input: number; cacheWrite: number; cacheRead: number; output: number };
  runs: number;
  costUsd: number;
  previousTotal: number;
  /** Percent change from the 7 days before; null when there was nothing to compare with. */
  changePct: number | null;
  busiest: DayUsage | null;
  perDay: number;
  perRun: number;
  topRoom: Grouped | null;
  topModel: Grouped | null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The last 7 calendar days (today included, local time), day by day, with the 7 days before for comparison. */
export function weeklyAnalytics(recs: UsageRecord[], now = Date.now()): WeeklyAnalytics {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const days: DayUsage[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: dayKey(d), label: d.toLocaleDateString("en-US", { weekday: "short" }), input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: 0, runs: 0, costUsd: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const week = recs.filter((r) => r.at >= start.getTime() && r.at <= now);
  for (const r of week) {
    const d = byDate.get(dayKey(new Date(r.at)));
    if (!d) continue;
    d.input += r.inputTokens;
    d.cacheWrite += r.cacheWriteTokens ?? 0;
    d.cacheRead += r.cacheReadTokens ?? 0;
    d.output += r.outputTokens;
    d.total += tokensOf(r);
    d.runs += 1;
    d.costUsd = round(d.costUsd + r.costUsd);
  }
  const prevStart = start.getTime() - 7 * DAY;
  const previousTotal = recs.filter((r) => r.at >= prevStart && r.at < start.getTime()).reduce((n, r) => n + tokensOf(r), 0);
  const total = days.reduce((n, d) => n + d.total, 0);
  const runs = week.length;
  const busiest = days.reduce<DayUsage | null>((b, d) => (d.total > 0 && (!b || d.total > b.total) ? d : b), null);
  const rooms = groupBy(week, (r) => r.room);
  const models = groupBy(week, (r) => r.model || "unknown");
  return {
    days,
    total,
    split: days.reduce((s, d) => ({ input: s.input + d.input, cacheWrite: s.cacheWrite + d.cacheWrite, cacheRead: s.cacheRead + d.cacheRead, output: s.output + d.output }), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }),
    runs,
    costUsd: round(week.reduce((n, r) => n + r.costUsd, 0)),
    previousTotal,
    changePct: previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null,
    busiest,
    perDay: Math.round(total / 7),
    perRun: runs ? Math.round(total / runs) : 0,
    topRoom: rooms[0] ?? null,
    topModel: models[0] ?? null,
  };
}

