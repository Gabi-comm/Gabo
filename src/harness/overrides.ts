import fs from "node:fs";
import path from "node:path";
import { isAgentId, type AgentId } from "./agents";

/** Gab's edits from the Settings page. The spec text stays the default; these sit on top. */
export interface AgentOverride {
  /** Replaces the agent's role text from docs/spec.md. */
  prompt?: string;
  /** Appended to the prompt as "Gab's added goal for you: …". */
  goal?: string;
  /** Replaces the recommended model / effort for this agent (docs/token-budget.md). */
  model?: string;
  effort?: string;
  updatedAt?: number;
}

export type Overrides = Partial<Record<AgentId, AgentOverride>>;

export const MAX_PROMPT = 20_000;
export const MAX_GOAL = 4_000;

/** Tracked in git (config/), so edited prompts can be committed alongside the code. */
export const OVERRIDES_FILE = process.env.HARNESS_FAKE === "1"
  ? path.join(process.cwd(), ".data-fake", "agent-overrides.json") // e2e runs never edit the real, tracked file
  : path.join(process.cwd(), "config", "agent-overrides.json");

export function loadOverrides(file = OVERRIDES_FILE): Overrides {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Overrides) : {};
  } catch {
    return {};
  }
}

function write(file: string, all: Overrides): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** Saves the given fields; an empty or blank value clears that field. */
export function saveOverride(file: string, id: AgentId, patch: { prompt?: string; goal?: string; model?: string; effort?: string }): AgentOverride | undefined {
  if (!isAgentId(id)) throw new Error(`Unknown agent: ${String(id)}`);
  if (patch.prompt !== undefined && patch.prompt.length > MAX_PROMPT) throw new Error(`The prompt is too long (max ${MAX_PROMPT.toLocaleString()} characters).`);
  if (patch.goal !== undefined && patch.goal.length > MAX_GOAL) throw new Error(`The goal is too long (max ${MAX_GOAL.toLocaleString()} characters).`);
  const all = loadOverrides(file);
  const next: AgentOverride = { ...all[id] };
  for (const key of ["model", "effort"] as const) {
    if (patch[key] === undefined) continue;
    const v = patch[key]!.trim();
    if (!v) delete next[key];
    else if (key === "model" ? /^[\w.:\-[\]]{1,80}$/.test(v) : ["low", "medium", "high", "xhigh", "max"].includes(v)) next[key] = v;
    else throw new Error(`Bad ${key}: ${v}`);
  }
  for (const key of ["prompt", "goal"] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key]!.trim();
    if (value) next[key] = patch[key]!.replace(/\r\n/g, "\n").trim();
    else delete next[key];
  }
  if (next.prompt === undefined && next.goal === undefined && next.model === undefined && next.effort === undefined) {
    delete all[id];
    write(file, all);
    return undefined;
  }
  next.updatedAt = Date.now();
  all[id] = next;
  write(file, all);
  return next;
}

export function resetOverride(file: string, id: AgentId): void {
  if (!isAgentId(id)) throw new Error(`Unknown agent: ${String(id)}`);
  const all = loadOverrides(file);
  delete all[id];
  write(file, all);
}
