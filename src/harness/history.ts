// Claude Code session history (the CLI's JSONL transcripts) → the app's transcript items. Pure; no I/O.
import { isAgentId } from "./agents";
import { summarizeTool } from "./events";
import type { Item } from "@/components/cli/transcript";

type Block = { type: string; [k: string]: unknown };
interface HistoryMessage {
  type: "user" | "assistant" | "system";
  parent_tool_use_id: string | null;
  message: unknown;
}

const PREVIEW_LINES = 4;
const PREVIEW_CHARS = 400;

function blocksOf(message: unknown): Block[] {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as Block[]) : [];
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b: Block) => (b.type === "text" ? String(b.text) : `[${b.type}]`)).join("\n");
  return "";
}

/**
 * What the user actually typed: slash commands shown as `/name args`, system reminders and
 * local command output (CLI bookkeeping) removed. Empty string = nothing to show.
 */
export function cleanUserText(raw: string): string {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(raw)?.[1]?.trim();
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(raw)?.[1]?.trim();
    return args ? `${name} ${args}` : name;
  }
  return raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<local-command-(stdout|stderr|caveat)>[\s\S]*?<\/local-command-\1>/g, "")
    .trim();
}

/** Claude Code starts a compacted conversation with this user message. */
const COMPACT_SUMMARY = /^This session is being continued from a previous conversation[^\n]*\n/;

export function historyToItems(messages: HistoryMessage[]): Item[] {
  const items: Item[] = [];
  const toolIndex = new Map<string, number>();
  for (const m of messages) {
    // Subagent internals stay folded under their agent block, as in the CLI.
    if (m.parent_tool_use_id) continue;
    if (m.type === "user") {
      for (const b of blocksOf(m.message)) {
        if (b.type === "text") {
          const raw = String(b.text ?? "");
          if (COMPACT_SUMMARY.test(raw)) { items.push({ kind: "summary", text: raw.replace(COMPACT_SUMMARY, "").trim() }); continue; }
          const text = cleanUserText(raw);
          if (text) items.push({ kind: "user", text });
        } else if (b.type === "tool_result") {
          const i = toolIndex.get(String(b.tool_use_id));
          if (i === undefined) continue;
          const item = items[i];
          const ok = !b.is_error;
          if (item.kind === "agent") {
            items[i] = { ...item, status: ok ? "ok" : "error" };
          } else if (item.kind === "tool") {
            const text = resultText(b.content);
            const lines = text ? text.split("\n") : [];
            items[i] = { ...item, status: ok ? "ok" : "error", preview: lines.slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS), lines: lines.length };
          }
        }
      }
    } else if (m.type === "assistant") {
      for (const b of blocksOf(m.message)) {
        if (b.type === "text" && String(b.text ?? "").trim()) {
          items.push({ kind: "text", agent: null, text: String(b.text) });
        } else if (b.type === "tool_use") {
          const id = String(b.id);
          const name = String(b.name);
          const input = (b.input ?? {}) as Record<string, unknown>;
          toolIndex.set(id, items.length);
          if ((name === "Agent" || name === "Task") && isAgentId(input.subagent_type)) {
            items.push({ kind: "agent", agent: input.subagent_type, toolUseId: id, description: String(input.description ?? ""), status: "ok" });
          } else {
            items.push({ kind: "tool", id, summary: summarizeTool(name, input), agent: null, status: "ok" });
          }
        }
      }
    }
  }
  return items;
}

export function sessionTitle(s: { customTitle?: string; summary?: string; firstPrompt?: string }): string {
  const pick = s.customTitle?.trim() || s.summary?.trim() || (s.firstPrompt ? cleanUserText(s.firstPrompt) : "");
  const one = (pick || "Untitled").replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 79)}…` : one;
}
