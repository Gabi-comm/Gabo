import fs from "node:fs";
import path from "node:path";
import { parsePlanUsage, summarizeUsage, type PlanUsage, type UsageRecord } from "@/harness/usage";
import { DATA_DIR, FAKE } from "./config";

export const USAGE_FILE = path.join(DATA_DIR, "usage.jsonl");
const LIMITS_FILE = path.join(DATA_DIR, "rate-limits.json");
const MAX_LINES = 5000;

/** One line per finished run. Cheap to append; trimmed when it grows past MAX_LINES. */
export function appendUsage(rec: UsageRecord, file = USAGE_FILE): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_LINES) fs.writeFileSync(file, `${lines.slice(-MAX_LINES).join("\n")}\n`);
  } catch { /* usage is best-effort; never break a run over it */ }
}

export function readUsage(file = USAGE_FILE): UsageRecord[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l) as UsageRecord]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

export interface RateLimit { type: string; status: string; utilization?: number; resetsAt?: number; at: number }

export function readRateLimits(): RateLimit[] {
  try { return JSON.parse(fs.readFileSync(LIMITS_FILE, "utf8")); } catch { return []; }
}

/** The latest rate-limit report per window, as Claude Code sends them during runs. */
export function recordRateLimit(info: Record<string, unknown>): void {
  try {
    const type = typeof info.rateLimitType === "string" ? info.rateLimitType : "unknown";
    const next: RateLimit = {
      type, status: String(info.status ?? "unknown"), at: Date.now(),
      ...(typeof info.utilization === "number" ? { utilization: info.utilization } : {}),
      ...(typeof info.resetsAt === "number" ? { resetsAt: info.resetsAt } : {}),
    };
    fs.mkdirSync(path.dirname(LIMITS_FILE), { recursive: true });
    fs.writeFileSync(LIMITS_FILE, JSON.stringify([next, ...readRateLimits().filter((r) => r.type !== type)], null, 2));
  } catch { /* best-effort */ }
}

type Plan = { text: string; meters: PlanUsage[] } | null;
const g = globalThis as unknown as { __gaboPlan?: { at: number; value: Promise<Plan> } };
const PLAN_TTL = 60_000;

async function readPlan(): Promise<Plan> {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 30_000);
    let text = "";
    try {
      for await (const m of query({ prompt: "/usage", options: { env, persistSession: false, maxTurns: 1, abortController } })) {
        if (m.type === "result" && m.subtype === "success") text = m.result;
        if (m.type === "system" && m.subtype === "local_command_output") text = m.content;
      }
    } finally {
      clearTimeout(timer);
    }
    return text ? { text, meters: parsePlanUsage(text) } : null;
  } catch {
    return null;
  }
}

/** Claude Code's own /usage (plan meters). A local command: no tokens, not saved to history. Cached 1 min. */
export function planUsage(refresh = false): Promise<Plan> {
  if (FAKE) {
    const text = "Current session: 42% used · resets 10:00pm\nCurrent week (all models): 17% used · resets Oct 1";
    return Promise.resolve({ text, meters: parsePlanUsage(text) });
  }
  if (!refresh && g.__gaboPlan && Date.now() - g.__gaboPlan.at < PLAN_TTL) return g.__gaboPlan.value;
  const value = readPlan();
  g.__gaboPlan = { at: Date.now(), value };
  return value;
}

export function usageSummary() {
  return summarizeUsage(readUsage());
}
