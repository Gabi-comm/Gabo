import fs from "node:fs";
import path from "node:path";
import { isCustomId } from "@/harness/agents";
import { makeCustomId, validateCustomAgent, type CustomAgent } from "@/harness/customAgents";

/** Tracked in git next to agent-overrides.json; fake mode (e2e) keeps its own copy. */
export const CUSTOM_AGENTS_FILE = process.env.HARNESS_FAKE === "1"
  ? path.join(process.cwd(), ".data-fake", "custom-agents.json")
  : path.join(process.cwd(), "config", "custom-agents.json");

export function loadCustomAgents(file = CUSTOM_AGENTS_FILE): CustomAgent[] {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data) ? data.filter((a) => a && isCustomId(a.id)) : [];
  } catch {
    return [];
  }
}

function write(file: string, all: CustomAgent[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function createCustomAgent(file: string, raw: unknown): CustomAgent {
  const all = loadCustomAgents(file);
  const v = validateCustomAgent(raw, all);
  if (!v.ok) throw new Error(v.error);
  const now = Date.now();
  const agent: CustomAgent = { id: makeCustomId(v.value.name, all.map((a) => a.id)), ...v.value, createdAt: now, updatedAt: now };
  write(file, [...all, agent]);
  return agent;
}

export function updateCustomAgent(file: string, id: string, raw: unknown): CustomAgent {
  const all = loadCustomAgents(file);
  const i = all.findIndex((a) => a.id === id);
  if (i === -1) throw new Error(`Agent ${id} not found.`);
  const v = validateCustomAgent(raw, all, id);
  if (!v.ok) throw new Error(v.error);
  const next = { ...all[i], ...v.value, updatedAt: Date.now() };
  all[i] = next;
  write(file, all);
  return next;
}

export function deleteCustomAgent(file: string, id: string): void {
  write(file, loadCustomAgents(file).filter((a) => a.id !== id));
}
