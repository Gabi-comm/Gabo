import type { AgentId } from "@/harness/agents";
import type { Decision, SkillLine, SkillRec, UiEvent } from "@/harness/events";

export type Status = "running" | "ok" | "error" | "stopped";

export type Item =
  | { kind: "user"; text: string }
  | { kind: "text"; agent: AgentId | null; text: string }
  | { kind: "tool"; id: string; summary: string; agent: AgentId | null; status: Status; preview?: string; lines?: number }
  | { kind: "agent"; agent: AgentId; toolUseId: string; description: string; status: Status; progress?: string }
  | { kind: "permission"; requestId: string; tool: string; summary: string; decision?: Decision }
  | { kind: "skills"; lines: SkillLine[]; missing: SkillRec[]; note?: string; installed?: string[]; dismissed?: boolean }
  | { kind: "error"; message: string; hint?: string }
  | { kind: "notice"; text: string };

export interface Transcript {
  items: Item[];
  running: boolean;
  pendingPermission: string | null;
  model: string;
  cwd: string;
  tokens: number;
  costUsd: number;
}

export type Action =
  | UiEvent
  | { type: "user_prompt"; text: string }
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
      return { ...t, running: true, items: [...t.items, { kind: "user", text: a.text }] };
    case "notice":
      return { ...t, items: [...t.items, { kind: "notice", text: a.text }] };
    case "clear":
      return { ...initialTranscript, model: t.model, cwd: t.cwd };
    case "hydrate":
      return { ...a.state, running: false, pendingPermission: null };
    case "session":
      return { ...t, model: a.model, cwd: a.cwd };
    case "text": {
      const last = t.items.at(-1);
      if (last?.kind === "text" && last.agent === a.agent) {
        return { ...t, items: [...t.items.slice(0, -1), { ...last, text: last.text + a.delta }] };
      }
      return { ...t, items: [...t.items, { kind: "text", agent: a.agent, text: a.delta }] };
    }
    case "tool_start":
      return { ...t, items: [...t.items, { kind: "tool", id: a.id, summary: a.summary, agent: a.agent, status: "running" }] };
    case "tool_result":
      return { ...t, items: patchLast(t.items, "tool", (i) => i.id === a.id, { status: a.ok ? "ok" : "error", preview: a.preview, lines: a.lines }) };
    case "agent_start":
      return { ...t, items: [...t.items, { kind: "agent", agent: a.agent, toolUseId: a.toolUseId, description: a.description, status: "running" }] };
    case "agent_progress":
      return { ...t, items: patchLast(t.items, "agent", (i) => i.agent === a.agent && i.status === "running", { progress: a.summary }) };
    case "agent_stop":
      return { ...t, items: patchLast(t.items, "agent", (i) => i.toolUseId === a.toolUseId, { status: a.ok ? "ok" : "error" }) };
    case "permission_request":
      return {
        ...t, pendingPermission: a.requestId,
        items: [...t.items, { kind: "permission", requestId: a.requestId, tool: a.tool, summary: a.summary }],
      };
    case "permission_resolved":
      return {
        ...t, pendingPermission: t.pendingPermission === a.requestId ? null : t.pendingPermission,
        items: patchLast(t.items, "permission", (i) => i.requestId === a.requestId, { decision: a.decision }),
      };
    case "skills":
      return { ...t, items: [...t.items, { kind: "skills", lines: a.lines, missing: a.missing, note: a.note }] };
    case "skills_installed":
      return { ...t, items: patchLast(t.items, "skills", () => true, { installed: a.names }) };
    case "skills_dismissed":
      return { ...t, items: patchLast(t.items, "skills", () => true, { dismissed: true }) };
    case "result":
      return { ...t, tokens: t.tokens + a.inputTokens + a.outputTokens, costUsd: t.costUsd + a.costUsd };
    case "error":
      return { ...t, items: [...t.items, { kind: "error", message: a.message, hint: a.hint }] };
    case "done":
      return {
        ...t, running: false, pendingPermission: null,
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
export function pulledAgents(t: Transcript): AgentId[] {
  const seen: AgentId[] = [];
  for (const i of t.items) if (i.kind === "agent" && !seen.includes(i.agent)) seen.push(i.agent);
  return seen;
}

export function activeAgents(t: Transcript): AgentId[] {
  return [...new Set(t.items.filter((i) => i.kind === "agent" && i.status === "running").map((i) => (i as { agent: AgentId }).agent))];
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
