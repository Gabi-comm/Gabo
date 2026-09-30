import type { AgentKey } from "../agents";
import { metaOf } from "../agentMeta";
import type { CustomAgent } from "../customAgents";
import type { SkillLine, SkillRec } from "../events";
import type { CatalogSkill } from "./catalog";

export interface PoolSkill { name: string; description: string; installed: boolean }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildScoutPrompt(task: string, roster: AgentKey[], pool: PoolSkill[], rule: string, customs: readonly CustomAgent[] = []): string {
  return [
    "You pick skills for a team of agents. Follow this rule exactly:",
    rule,
    "",
    "Agents on this task:",
    ...roster.map((a) => { const m = metaOf(a, customs); return `- ${a}: ${m.name}. ${m.tagline}`; }),
    "",
    "Available skills (name: one-line description):",
    ...pool.map((s) => `- ${s.name}: ${clip(s.description, 160)}`),
    "",
    `The task: ${clip(task, 1500)}`,
    "",
    'Reply with JSON only: {"lines":[{"agent":"<agent id>","skills":["<skill name>"],"why":"<five words or fewer>"}]}.',
    "One line per agent. Use an empty skills list when nothing fits. Never force a skill into work it was not made for.",
  ].join("\n");
}

/** Parses the model's reply, dropping unknown agents and skills. Every roster agent gets exactly one line. */
export function parseScoutReply(reply: string, roster: AgentKey[], poolNames: string[]): SkillLine[] {
  const known = new Set(poolNames);
  const byAgent = new Map<AgentKey, SkillLine>();
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const data = JSON.parse(reply.slice(start, end + 1)) as { lines?: unknown };
      for (const raw of Array.isArray(data.lines) ? data.lines : []) {
        const l = raw as { agent?: unknown; skills?: unknown; why?: unknown };
        if (typeof l.agent !== "string" || !roster.includes(l.agent as AgentKey)) continue;
        const skills = (Array.isArray(l.skills) ? l.skills : []).filter((s): s is string => typeof s === "string" && known.has(s));
        byAgent.set(l.agent as AgentKey, { agent: l.agent as AgentKey, skills: [...new Set(skills)], why: typeof l.why === "string" ? clip(l.why, 60) : "" });
      }
    } catch { /* fall through to "none" for everyone */ }
  }
  return roster.map((agent) => byAgent.get(agent) ?? { agent, skills: [], why: "" });
}

/** Catalog skills an agent kept that aren't installed yet: these become the Download prompt. */
export function computeMissing(lines: SkillLine[], catalog: CatalogSkill[], installed: Set<string>): SkillRec[] {
  const recs = new Map<string, SkillRec>();
  for (const line of lines) {
    for (const name of line.skills) {
      if (installed.has(name)) continue;
      const entry = catalog.find((c) => c.name === name);
      if (!entry) continue;
      const rec = recs.get(name) ?? { name, description: entry.description, agents: [] };
      if (!rec.agents.includes(line.agent)) rec.agents.push(line.agent);
      recs.set(name, rec);
    }
  }
  return [...recs.values()];
}
