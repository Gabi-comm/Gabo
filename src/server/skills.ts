import path from "node:path";
import type { AgentKey } from "@/harness/agents";
import type { UiEvent } from "@/harness/events";
import { loadSpec } from "@/harness/spec";
import { rosterFor, type RoomId } from "@/harness/rooms";
import type { CustomAgent } from "@/harness/customAgents";
import { SKILL_READ_ROOTS } from "@/harness/runner";
import { fetchCatalog, listLocal, type CatalogSkill } from "@/harness/skills/catalog";
import { workspaceSkillsDir } from "@/harness/skills/install";
import { buildScoutPrompt, computeMissing, parseScoutReply, type PoolSkill } from "@/harness/skills/scout";
import { keywordScout } from "@/harness/skills/keywords";
import { activeBackend } from "./backend";
import { DATA_DIR, sessions } from "./config";

export const CATALOG_CACHE = path.join(DATA_DIR, "skills-catalog.json");
const SCOUT_TIMEOUT_MS = 60_000;

export interface PrepareSkillsInput {
  conversationId: string;
  room: RoomId;
  prompt: string;
  workspace: string;
  firstTurn: boolean;
  emit: (e: UiEvent) => void;
  signal?: AbortSignal;
  team?: string[];
  customAgents?: CustomAgent[];
  /** Local LLM: pick by keyword match from installed skills, with no model call and no network. */
  offline?: boolean;
}

type SkillMap = Partial<Record<AgentKey, string[]>>;

function onlyInstalled(map: SkillMap, installed: Set<string>): SkillMap {
  return Object.fromEntries(Object.entries(map).map(([a, s]) => [a, (s ?? []).filter((n) => installed.has(n))]));
}

/** One cheap, tool-less Haiku turn on the subscription that returns the scout's JSON. */
async function askScout(prompt: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const active = activeBackend();
  if (active.problem) throw new Error(active.problem);
  const env = active.env;
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), SCOUT_TIMEOUT_MS);
  const onAbort = () => abortController.abort();
  signal?.addEventListener("abort", onAbort);
  let text = "";
  try {
    for await (const m of query({
      prompt,
      options: {
        model: "haiku", maxTurns: 1, cwd, env, abortController, settingSources: [],
        // Bookkeeping turn: keep it out of Gab's Claude Code session history.
        persistSession: false,
        systemPrompt: "You output JSON only. No prose.",
        canUseTool: async () => ({ behavior: "deny", message: "The skill scout uses no tools." }),
      },
    })) {
      if (m.type === "result" && m.subtype === "success") text = m.result;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return text;
}

/**
 * The skill-scout rule from the spec: before the first task of a chat, each pulled agent keeps only the
 * skills that fit its role and the task. Later turns reuse the pick (plus anything downloaded since).
 */
export async function prepareSkills({ conversationId, room, prompt, workspace, firstTurn, emit, signal, team, customAgents = [], offline = false }: PrepareSkillsInput): Promise<SkillMap> {
  const local = listLocal([...SKILL_READ_ROOTS, workspaceSkillsDir(workspace)]);
  const installed = new Set(local.map((s) => s.name));
  const saved = sessions.get(conversationId)?.skills;
  if (!firstTurn && saved) return onlyInstalled(saved, installed);

  const roster = rosterFor(room, team);
  // Keyword match first: instant, no model call, no network (plan-faster-replies §4).
  const keywordLines = keywordScout(prompt, roster, local.map((l) => ({ name: l.name, description: l.description, installed: true })));
  if (offline || keywordLines.some((l) => l.skills.length)) {
    emit({ type: "skills", lines: keywordLines, missing: [], note: offline ? "Local LLM: skills picked by keyword match from installed skills (no Claude call)." : "Skills picked by keyword match (no extra model call)." });
    const picked: SkillMap = Object.fromEntries(keywordLines.map((l) => [l.agent, l.skills]));
    sessions.upsert({ id: conversationId, skills: picked });
    return onlyInstalled(picked, installed);
  }
  // Nothing matched: ask the model scout in the background, off the reply's critical path. Its picks (and
  // download suggestions) apply from the next message.
  void modelScout({ conversationId, prompt, workspace, roster, local, installed, customAgents, emit }).catch(() => {});
  return {};
}

async function modelScout({ conversationId, prompt, workspace, roster, local, installed, customAgents, emit }: {
  conversationId: string; prompt: string; workspace: string; roster: AgentKey[]; local: { name: string; description: string }[];
  installed: Set<string>; customAgents: CustomAgent[]; emit: (e: UiEvent) => void;
}): Promise<void> {
  let catalog: CatalogSkill[] = [];
  let note: string | undefined;
  try {
    catalog = await fetchCatalog({ cacheFile: CATALOG_CACHE });
  } catch {
    note = "Couldn't reach vercel-labs/agent-skills, so agents picked from installed skills only.";
  }
  const pool = new Map<string, PoolSkill>();
  for (const c of catalog) pool.set(c.name, { name: c.name, description: c.description, installed: installed.has(c.name) });
  for (const l of local) if (!pool.has(l.name)) pool.set(l.name, { name: l.name, description: l.description, installed: true });

  let reply = "";
  try {
    reply = await askScout(buildScoutPrompt(prompt, roster, [...pool.values()], loadSpec().skillScout, customAgents), workspace);
  } catch {
    note = "The skill scout didn't answer, so agents run without extra skills this time.";
  }
  const lines = parseScoutReply(reply, roster, [...pool.keys()]);
  const missing = computeMissing(lines, catalog, installed);
  emit({ type: "skills", lines, missing, note: note ?? "Picked in the background; these skills apply from your next message." });
  sessions.upsert({ id: conversationId, skills: Object.fromEntries(lines.map((l) => [l.agent, l.skills])) });
}
