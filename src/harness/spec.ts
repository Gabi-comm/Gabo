import fs from "node:fs";
import path from "node:path";
import { AGENT_IDS, type AgentId } from "./agents";

export interface ParsedSpec {
  agents: Record<AgentId, string>;
  ideaRubric: string;
  emperorUsage: string;
  skillScout: string;
}

function between(md: string, open: string, close: string): string {
  const start = md.indexOf(open);
  if (start === -1) return "";
  const end = md.indexOf(close, start + open.length);
  return md.slice(start + open.length, end === -1 ? undefined : end).trim();
}

export function parseSpec(raw: string): ParsedSpec {
  const md = raw.replace(/\r\n/g, "\n");
  const agents = {} as Record<AgentId, string>;
  for (const id of AGENT_IDS) agents[id] = between(md, `<!-- agent:${id} -->`, "<!-- /agent -->");
  return {
    agents,
    ideaRubric: between(md, "<!-- idea-rubric -->", "<!-- /idea-rubric -->"),
    emperorUsage: between(md, "<!-- emperor-usage -->", "<!-- /emperor-usage -->"),
    skillScout: between(md, "<!-- skill-scout -->", "<!-- /skill-scout -->"),
  };
}

let cached: { mtimeMs: number; spec: ParsedSpec } | null = null;

/** Reads docs/spec.md, re-parsing only when the file changes so role edits apply without a restart. */
export function loadSpec(root = process.cwd()): ParsedSpec {
  const file = path.join(root, "docs", "spec.md");
  const { mtimeMs } = fs.statSync(file);
  if (!cached || cached.mtimeMs !== mtimeMs) cached = { mtimeMs, spec: parseSpec(fs.readFileSync(file, "utf8")) };
  return cached.spec;
}
