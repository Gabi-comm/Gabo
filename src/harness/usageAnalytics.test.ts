import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runUsage, tokensOf, weeklyAnalytics, type UsageRecord } from "./usage";
import { logRun, readUsage } from "@/server/usageLog";

const c = (input: number, output: number, cacheRead = 0, cacheWrite = 0, costUsd = 0) => ({ input, output, cacheRead, cacheWrite, costUsd });

describe("per-run usage from Claude Code's running totals", () => {
  it("a new session's total is the run; later runs are the change since the last total", () => {
    expect(runUsage(c(100, 50, 1000, 200, 0.5), undefined, c(10, 5), false)).toEqual(c(100, 50, 1000, 200, 0.5));
    expect(runUsage(c(150, 80, 3000, 260, 0.9), c(100, 50, 1000, 200, 0.5), c(1, 1), false)).toEqual(c(50, 30, 2000, 60, 0.4));
  });
  it("a cleared session (total went down) counts the new total; a first resume counts only this turn", () => {
    expect(runUsage(c(20, 10), c(100, 50), c(1, 1), false)).toEqual(c(20, 10));
    expect(runUsage(c(900_000, 5000, 8_000_000), undefined, c(6, 2032, 780_000, 0, 0), true)).toEqual(c(6, 2032, 780_000, 0, 0));
  });
  it("logRun stores the cursor so two runs of one session add up to its total", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gabo-usage-"));
    const file = path.join(dir, "usage.jsonl");
    const cursors = path.join(dir, "cursors.json");
    const base = { room: "home", model: "m", sessionId: "s1", resumed: false, turn: c(0, 0) };
    logRun({ ...base, at: 1, total: c(100, 10, 500, 50, 0.2) }, file, cursors);
    logRun({ ...base, at: 2, resumed: true, total: c(130, 25, 1500, 60, 0.3) }, file, cursors);
    const recs = readUsage(file);
    expect(recs.map(tokensOf)).toEqual([660, 1055]);
    expect(recs.reduce((n, r) => n + tokensOf(r), 0)).toBe(130 + 25 + 1500 + 60);
  });
});

describe("weekly analytics", () => {
  const now = new Date(2026, 9, 1, 15, 0).getTime(); // Thu 1 Oct 2026, 3pm local
  const at = (daysAgo: number, h = 10) => new Date(2026, 9, 1 - daysAgo, h).getTime();
  const rec = (daysAgo: number, input: number, cacheRead = 0, room = "home", model = "sonnet"): UsageRecord =>
    ({ at: at(daysAgo), room, model, inputTokens: input, outputTokens: 100, cacheReadTokens: cacheRead, cacheWriteTokens: 0, costUsd: 0.01 });

  it("splits the last 7 calendar days, finds the busiest, and compares with the week before", () => {
    const a = weeklyAnalytics([rec(0, 1000, 5000), rec(2, 400), rec(2, 400, 0, "library"), rec(6, 100), rec(9, 2000), { ...rec(0, 0), at: now + 1 }], now);
    expect(a.days.map((d) => d.label)).toEqual(["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]);
    expect(a.days[6].total).toBe(6100);
    expect(a.days[4]).toMatchObject({ runs: 2, total: 1000 });
    expect(a.total).toBe(6100 + 1000 + 200);
    expect(a.split).toEqual({ input: 1900, cacheWrite: 0, cacheRead: 5000, output: 400 });
    expect(a.busiest?.label).toBe("Thu");
    expect(a.previousTotal).toBe(2100);
    expect(a.changePct).toBe(248);
    expect(a.perRun).toBe(Math.round(7300 / 4));
    expect(a.topRoom?.key).toBe("home");
  });
  it("averages reply speed over the runs that logged it", () => {
    const a = weeklyAnalytics([{ ...rec(0, 10), ttftMs: 2000, durationMs: 10000 }, { ...rec(1, 10), ttftMs: 4000, durationMs: 20000 }, rec(1, 10)], now);
    expect(a.speed).toEqual({ firstWordsS: 3, doneS: 15, runs: 2 });
    expect(weeklyAnalytics([rec(0, 10)], now).speed).toBeNull();
  });
  it("is empty and has no comparison when nothing was logged", () => {
    const a = weeklyAnalytics([], now);
    expect(a.total).toBe(0);
    expect(a.changePct).toBeNull();
    expect(a.busiest).toBeNull();
  });
});
