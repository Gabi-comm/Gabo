import { isAgentId, type AgentKey } from "./agents";

export type Decision = "allow" | "allow_session" | "deny";

export interface SkillLine { agent: AgentKey; skills: string[]; why: string }
export interface SkillRec { name: string; description: string; agents: AgentKey[] }

export interface Todo { content: string; status: "pending" | "in_progress" | "completed"; activeForm?: string }
export interface Diff { path: string; removed?: string; added?: string }
export interface Question { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] }
export type AskKind = "tool" | "question" | "plan";

/** Everything the browser receives over the run stream. */
export type UiEvent =
  | { type: "session"; sessionId: string; model: string; cwd: string }
  | { type: "text"; delta: string; agent: AgentKey | null }
  | { type: "tool_start"; id: string; name: string; summary: string; agent: AgentKey | null; todos?: Todo[]; diff?: Diff }
  | { type: "tool_result"; id: string; ok: boolean; preview: string; lines: number }
  | { type: "agent_start"; agent: AgentKey; toolUseId: string; description: string; from?: AgentKey[] }
  | { type: "agent_progress"; agent: AgentKey; summary: string }
  | { type: "agent_stop"; agent: AgentKey; toolUseId: string; ok: boolean }
  | { type: "permission_request"; requestId: string; tool: string; summary: string; kind?: AskKind; questions?: Question[]; plan?: string }
  | { type: "permission_resolved"; requestId: string; decision: Decision; answers?: Record<string, string> }
  | { type: "skills"; lines: SkillLine[]; missing: SkillRec[]; note?: string }
  | { type: "result"; ok: boolean; costUsd: number; inputTokens: number; outputTokens: number; durationMs: number; tokens?: TokenCounts; turnTokens?: TokenCounts }
  | { type: "error"; message: string; hint?: string }
  | { type: "notice"; text: string }
  | { type: "rate_limit"; info: Record<string, unknown> }
  | { type: "mode"; mode: string }
  | { type: "done" };

type Block = { type: string; [k: string]: unknown };

export interface TokenCounts { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number }

function sumModelUsage(raw: unknown, costUsd: number): TokenCounts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const t: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd };
  for (const m of Object.values(raw as Record<string, Record<string, number>>)) {
    t.input += Number(m.inputTokens ?? 0);
    t.output += Number(m.outputTokens ?? 0);
    t.cacheRead += Number(m.cacheReadInputTokens ?? 0);
    t.cacheWrite += Number(m.cacheCreationInputTokens ?? 0);
  }
  return t;
}
type Msg = { type: string; subtype?: string; parent_tool_use_id?: string | null; [k: string]: unknown };

const PREVIEW_LINES = 4;
const PREVIEW_CHARS = 400;

function clip(s: string, n = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

/** Claude Code style one-liner: `Read(src/a.ts)`, `Bash(npm test)`. */
export function summarizeTool(name: string, input: Record<string, unknown>): string {
  const arg =
    input.command ?? input.file_path ?? input.notebook_path ?? input.pattern ?? input.url ?? input.query ??
    input.skill ?? input.description ?? input.prompt ?? "";
  return arg === "" ? name : `${name}(${clip(String(arg))})`;
}

const DIFF_CHARS = 2000;
const cut = (s: unknown) => (typeof s === "string" ? (s.length > DIFF_CHARS ? `${s.slice(0, DIFF_CHARS)}\n…` : s) : undefined);

/** A short before/after for file edits, shown under the tool line like the CLI's diff. */
function diffOf(name: string, input: Record<string, unknown>): Diff | undefined {
  const file = typeof input.file_path === "string" ? input.file_path : undefined;
  if (!file) return undefined;
  if (name === "Edit") return { path: file, removed: cut(input.old_string), added: cut(input.new_string) };
  if (name === "Write") return { path: file, added: cut(input.content) };
  if (name === "MultiEdit" && Array.isArray(input.edits)) {
    const edits = input.edits as { old_string?: string; new_string?: string }[];
    return { path: file, removed: cut(edits.map((e) => e.old_string ?? "").join("\n⋯\n")), added: cut(edits.map((e) => e.new_string ?? "").join("\n⋯\n")) };
  }
  return undefined;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b: Block) => (b.type === "text" ? String(b.text) : `[${b.type}]`)).join("\n");
  }
  return "";
}

/**
 * Stateful mapper from Agent SDK messages to UI events. One per run: it remembers which
 * tool_use ids are subagents so nested text and results are attributed to the right mascot.
 */
/** `known` says which subagent ids are Gab's agents (built-in or custom) so their words get their mascot. */
export function createMapper(known: (id: unknown) => boolean = isAgentId) {
  const subagentByToolUse = new Map<string, AgentKey>();
  const streamedFor = new Set<string>();
  const key = (parent: string | null | undefined) => parent ?? "main";
  const agentOf = (parent: string | null | undefined): AgentKey | null =>
    (parent && subagentByToolUse.get(parent)) || null;

  return function map(msg: Msg): UiEvent[] {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          return [{ type: "session", sessionId: String(msg.session_id), model: String(msg.model), cwd: String(msg.cwd) }];
        }
        if (msg.subtype === "local_command_output" && typeof msg.content === "string") {
          return [{ type: "notice", text: msg.content }];
        }
        if (msg.subtype === "compact_boundary") {
          const meta = (msg.compact_metadata ?? {}) as { trigger?: string; pre_tokens?: number };
          const was = typeof meta.pre_tokens === "number" ? `, was ${meta.pre_tokens.toLocaleString("en-US")} tokens` : "";
          return [{ type: "notice", text: `Conversation compacted (${meta.trigger ?? "auto"}${was}).` }];
        }
        if (msg.subtype === "status" && typeof msg.permissionMode === "string") {
          return [{ type: "mode", mode: msg.permissionMode }];
        }
        if (msg.subtype === "task_progress" && typeof msg.summary === "string") {
          const agent = subagentByToolUse.get(String(msg.tool_use_id));
          return agent ? [{ type: "agent_progress", agent, summary: msg.summary }] : [];
        }
        return [];
      }
      case "stream_event": {
        const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } };
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          streamedFor.add(key(msg.parent_tool_use_id));
          return [{ type: "text", delta: ev.delta.text, agent: agentOf(msg.parent_tool_use_id) }];
        }
        return [];
      }
      case "assistant": {
        const out: UiEvent[] = [];
        const k = key(msg.parent_tool_use_id);
        const streamed = streamedFor.delete(k);
        const agent = agentOf(msg.parent_tool_use_id);
        const blocks = ((msg.message as { content?: Block[] })?.content ?? []) as Block[];
        for (const b of blocks) {
          if (b.type === "text" && !streamed && b.text) {
            out.push({ type: "text", delta: String(b.text), agent });
          } else if (b.type === "tool_use") {
            const id = String(b.id);
            const name = String(b.name);
            const input = (b.input ?? {}) as Record<string, unknown>;
            if ((name === "Agent" || name === "Task") && typeof input.subagent_type === "string" && known(input.subagent_type)) {
              const who = input.subagent_type as AgentKey;
              subagentByToolUse.set(id, who);
              const from = handOffs(String(input.prompt ?? ""), [...new Set(subagentByToolUse.values())].filter((a) => a !== who));
              out.push({ type: "agent_start", agent: who, toolUseId: id, description: String(input.description ?? ""), ...(from.length ? { from } : {}) });
            } else if (name === "TodoWrite" && Array.isArray(input.todos)) {
              out.push({ type: "tool_start", id, name, summary: "Update Todos", agent, todos: input.todos as Todo[] });
            } else {
              const diff = diffOf(name, input);
              out.push({ type: "tool_start", id, name, summary: summarizeTool(name, input), agent, ...(diff ? { diff } : {}) });
            }
          }
        }
        return out;
      }
      case "user": {
        const content = (msg.message as { content?: unknown })?.content;
        if (!Array.isArray(content)) return [];
        const out: UiEvent[] = [];
        for (const b of content as Block[]) {
          if (b.type !== "tool_result") continue;
          const id = String(b.tool_use_id);
          const ok = !b.is_error;
          const sub = subagentByToolUse.get(id);
          if (sub) {
            out.push({ type: "agent_stop", agent: sub, toolUseId: id, ok });
            continue;
          }
          const text = resultText(b.content);
          const lines = text ? text.split("\n") : [];
          const preview = lines.slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS);
          out.push({ type: "tool_result", id, ok, preview, lines: lines.length });
        }
        return out;
      }
      case "rate_limit_event": {
        const info = msg.rate_limit_info;
        return info && typeof info === "object" ? [{ type: "rate_limit", info: info as Record<string, unknown> }] : [];
      }
      case "result": {
        const usage = (msg.usage ?? {}) as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        return [{
          type: "result",
          ok: msg.subtype === "success",
          costUsd: Number(msg.total_cost_usd ?? 0),
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          durationMs: Number(msg.duration_ms ?? 0),
          // modelUsage: every model call (main loop, subagents, compaction), running total for the session.
          tokens: sumModelUsage(msg.modelUsage, Number(msg.total_cost_usd ?? 0)),
          // usage: this turn's main loop only. Used when there is no earlier total to subtract.
          turnTokens: {
            input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0,
            cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, costUsd: 0,
          },
        }];
      }
      default:
        return [];
    }
  };
}

/** Teammates a brief hands work from: earlier agents named in it (by id, or by name for custom agents). */
export function handOffs(brief: string, earlier: AgentKey[]): AgentKey[] {
  const text = brief.toLowerCase();
  return earlier.filter((a) => {
    const plain = a.replace(/^x-/, "");
    return new RegExp(`\\b(${escapeRe(a)}|${escapeRe(plain.replace(/-/g, " "))})\\b`).test(text);
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

