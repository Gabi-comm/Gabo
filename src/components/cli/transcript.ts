import type { AgentKey } from "@/harness/agents";
import type { AskKind, Decision, Diff, Question, SkillLine, SkillRec, Todo, UiEvent } from "@/harness/events";

export type Status = "running" | "ok" | "error" | "stopped";

export type Item =
  | { kind: "user"; text: string; images?: number }
  | { kind: "text"; agent: AgentKey | null; text: string }
  | { kind: "tool"; id: string; summary: string; agent: AgentKey | null; status: Status; preview?: string; lines?: number; diff?: Diff; elapsed?: number }
  | { kind: "agent"; agent: AgentKey; toolUseId: string; description: string; status: Status; progress?: string; from?: AgentKey[] }
  | { kind: "permission"; requestId: string; tool: string; summary: string; decision?: Decision; ask?: AskKind; questions?: Question[]; plan?: string; answers?: Record<string, string> }
  | { kind: "skills"; lines: SkillLine[]; missing: SkillRec[]; note?: string; installed?: string[]; dismissed?: boolean }
  | { kind: "error"; message: string; hint?: string }
  | { kind: "notice"; text: string }
  | { kind: "thinking"; agent: AgentKey | null; text: string }
  | { kind: "activity"; agent: AgentKey | null; text: string }
  | { kind: "tier"; tier: "quick" | "standard" | "deep"; reason: string; prompt: string }
  /** What a compacted chat carries over (/compact summary). */
  | { kind: "summary"; from?: string; text: string };

export interface Transcript {
  items: Item[];
  running: boolean;
  pendingPermission: string | null;
  model: string;
  cwd: string;
  tokens: number;
  costUsd: number;
  /** Permission mode Claude Code last reported (e.g. after a plan is approved). */
  mode?: string;
  /** The latest TodoWrite list, shown above the input like the CLI. */
  todos?: Todo[];
  /** Tokens the chat re-reads on every message (the lead's last prompt size). */
  context?: number;
  /** Background agents still working after the lead ended its turn. */
  background?: { id: string; description: string }[];
}

export type Action =
  | UiEvent
  | { type: "user_prompt"; text: string; images?: number }
  | { type: "notice"; text: string }
  | { type: "skills_installed"; names: string[] }
  | { type: "skills_dismissed" }
  | { type: "clear" }
  | { type: "hydrate"; state: Transcript };

export const initialTranscript: Transcript = {
  items: [], running: false, pendingPermission: null, model: "", cwd: "", tokens: 0, costUsd: 0,
};

function patchLast<K extends Item["kind"]>(
  items: Item[], kind: K, match: (i: Extract<Item, { kind: K }>) => boolean, patch: Partial<Extract<Item, { kind: K }>>,
): Item[] {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === kind && match(it as Extract<Item, { kind: K }>)) {
      const next = items.slice();
      next[i] = { ...it, ...patch } as Item;
      return next;
    }
  }
  return items;
}

export function reduce(t: Transcript, a: Action): Transcript {
  switch (a.type) {
    case "user_prompt":
      return { ...t, running: true, items: [...t.items, { kind: "user", text: a.text, ...(a.images ? { images: a.images } : {}) }] };
    case "notice":
      return { ...t, items: [...t.items, { kind: "notice", text: a.text }] };
    case "thinking": {
      const last = t.items.at(-1);
      if (last?.kind === "thinking" && last.agent === a.agent) {
        return { ...t, items: [...t.items.slice(0, -1), { ...last, text: last.text + a.delta }] };
      }
      return { ...t, items: [...t.items, { kind: "thinking", agent: a.agent, text: a.delta }] };
    }
    case "activity":
      return { ...t, items: [...t.items, { kind: "activity", agent: a.agent, text: a.text }] };
    case "tool_progress":
      return { ...t, items: patchLast(t.items, "tool", (i) => i.id === a.id, { elapsed: a.seconds }) };
    case "background":
      return { ...t, background: a.tasks };
    case "tier":
      return { ...t, items: [...t.items, { kind: "tier", tier: a.tier, reason: a.reason, prompt: a.prompt }] };
    case "clear":
      return { ...initialTranscript, model: t.model, cwd: t.cwd };
    case "hydrate":
      return { ...a.state, running: false, pendingPermission: null };
    case "session":
      return { ...t, model: a.model, cwd: a.cwd };
    case "mode":
      return { ...t, mode: a.mode };
    case "text": {
      const last = t.items.at(-1);
      if (last?.kind === "text" && last.agent === a.agent) {
        return { ...t, items: [...t.items.slice(0, -1), { ...last, text: last.text + a.delta }] };
      }
      // Agents running in parallel stream at the same time: keep each one's text in its own block
      // (the latest text item since that agent started) instead of interleaving fragments.
      if (a.agent) {
        const startAt = t.items.findLastIndex((i) => i.kind === "agent" && i.agent === a.agent);
        const textAt = t.items.findLastIndex((i) => i.kind === "text" && i.agent === a.agent);
        if (textAt > startAt && startAt !== -1) {
          const item = t.items[textAt] as Extract<Item, { kind: "text" }>;
          const items = t.items.slice();
          items[textAt] = { ...item, text: item.text + a.delta };
          return { ...t, items };
        }
      }
      return { ...t, items: [...t.items, { kind: "text", agent: a.agent, text: a.delta }] };
    }
    case "tool_start":
      return {
        ...t,
        ...(a.todos ? { todos: a.todos } : {}),
        items: [...t.items, { kind: "tool", id: a.id, summary: a.summary, agent: a.agent, status: "running", ...(a.diff ? { diff: a.diff } : {}) }],
      };
    case "tool_result":
      return { ...t, items: patchLast(t.items, "tool", (i) => i.id === a.id, { status: a.ok ? "ok" : "error", preview: a.preview, lines: a.lines }) };
    case "agent_start":
      return { ...t, items: [...t.items, { kind: "agent", agent: a.agent, toolUseId: a.toolUseId, description: a.description, status: "running", ...(a.from?.length ? { from: a.from } : {}) }] };
    case "agent_progress":
      return { ...t, items: patchLast(t.items, "agent", (i) => i.agent === a.agent && i.status === "running", { progress: a.summary }) };
    case "agent_stop":
      return { ...t, items: patchLast(t.items, "agent", (i) => i.toolUseId === a.toolUseId, { status: a.ok ? "ok" : "error" }) };
    case "permission_request":
      return {
        ...t, pendingPermission: a.requestId,
        items: [...t.items, {
          kind: "permission", requestId: a.requestId, tool: a.tool, summary: a.summary,
          ...(a.kind ? { ask: a.kind } : {}), ...(a.questions ? { questions: a.questions } : {}), ...(a.plan !== undefined ? { plan: a.plan } : {}),
        }],
      };
    case "permission_resolved":
      return {
        ...t, pendingPermission: t.pendingPermission === a.requestId ? null : t.pendingPermission,
        items: patchLast(t.items, "permission", (i) => i.requestId === a.requestId, { decision: a.decision, ...(a.answers ? { answers: a.answers } : {}) }),
      };
    case "skills":
      return { ...t, items: [...t.items, { kind: "skills", lines: a.lines, missing: a.missing, note: a.note }] };
    case "skills_installed":
      return { ...t, items: patchLast(t.items, "skills", () => true, { installed: a.names }) };
    case "skills_dismissed":
      return { ...t, items: patchLast(t.items, "skills", () => true, { dismissed: true }) };
    case "result":
      return { ...t, tokens: t.tokens + a.inputTokens + a.outputTokens, costUsd: t.costUsd + a.costUsd, ...(a.contextTokens ? { context: a.contextTokens } : {}) };
    case "error":
      return { ...t, items: [...t.items, { kind: "error", message: a.message, hint: a.hint }] };
    case "done":
      return {
        ...t, running: false, pendingPermission: null, background: [],
        items: t.items.map((i) =>
          (i.kind === "tool" || i.kind === "agent") && i.status === "running" ? { ...i, status: "stopped" as const }
          : i.kind === "permission" && !i.decision ? { ...i, decision: "deny" as const }
          : i),
      };
    default:
      return t;
  }
}

/** Agents pulled into this conversation, in the order they first spoke. */
export function pulledAgents(t: Transcript): AgentKey[] {
  const seen: AgentKey[] = [];
  for (const i of t.items) if (i.kind === "agent" && !seen.includes(i.agent)) seen.push(i.agent);
  return seen;
}

export function activeAgents(t: Transcript): AgentKey[] {
  return [...new Set(t.items.filter((i) => i.kind === "agent" && i.status === "running").map((i) => (i as { agent: AgentKey }).agent))];
}

export function parseSse(buffer: string): { events: UiEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: UiEvent[] = [];
  for (const f of frames) {
    const line = f.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try { events.push(JSON.parse(line.slice(6))); } catch { /* skip malformed frame */ }
  }
  return { events, rest };
}
