import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RoomId } from "@/harness/rooms";
import { historyToItems, sessionTitle } from "@/harness/history";
import type { Item } from "@/components/cli/transcript";
import { roomHref } from "@/lib/routes";
import { FAKE, sessions } from "./config";
import { loadPins } from "./pins";

export interface HistoryEntry {
  /** Claude Code session id, or null for an app chat that hasn't started a session yet. */
  sessionId: string | null;
  title: string;
  cwd: string | null;
  project: string | null;
  branch: string | null;
  room: RoomId | null;
  updatedAt: number;
  href: string;
  /** Stable key for pinning: "s:<session id>" or "c:<chat id>". */
  pinKey: string;
  pinned: boolean;
}

export interface OpenedHistory {
  conversationId: string;
  room: RoomId;
  title: string;
  cwd: string | null;
  items: Item[];
  /** When the Claude Code session file last changed (0 when there is none yet). */
  updatedAt: number;
}

const MAX_ITEMS = 600;

const FAKE_SESSIONS = [
  { sessionId: "fake-cli-1", summary: "Fix login bug", cwd: "C:/Users/Gab/Documents/Rivan-Simulation", gitBranch: "main", lastModified: Date.now() - 3_600_000 },
];
const FAKE_MESSAGES = [
  { type: "user", parent_tool_use_id: null, message: { role: "user", content: "Fix the login bug" } },
  { type: "assistant", parent_tool_use_id: null, message: { role: "assistant", content: [
    { type: "text", text: "Found it: the token check ran before the cookie was read." },
    { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/auth.ts" } },
  ] } },
  { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Updated src/auth.ts" }] } },
];

async function sdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}

/** Every Claude Code session (CLI and app, all projects) plus app chats that haven't started one, newest first. */
export async function listHistory(limit = 80): Promise<HistoryEntry[]> {
  const records = sessions.list();
  const pins = new Set(loadPins());
  const bySession = new Map(records.filter((r) => r.sdkSessionId).map((r) => [r.sdkSessionId!, r]));
  const infos = FAKE ? FAKE_SESSIONS : await (await sdk()).listSessions({ limit });
  if (!FAKE) {
    // Pinned sessions older than the listing window are fetched one by one so they never disappear.
    const listedIds = new Set(infos.map((i) => i.sessionId));
    const missing = [...pins].filter((k) => k.startsWith("s:") && !listedIds.has(k.slice(2))).map((k) => k.slice(2));
    const { getSessionInfo } = await sdk();
    for (const id of missing) {
      const info = await getSessionInfo(id).catch(() => undefined);
      if (info) (infos as typeof info[]).push(info);
    }
  }

  const entries: HistoryEntry[] = infos.map((s) => {
    const record = bySession.get(s.sessionId);
    const cwd = s.cwd ?? null;
    return {
      sessionId: s.sessionId,
      title: record?.title ?? sessionTitle(s),
      cwd,
      project: cwd ? path.basename(cwd) : null,
      branch: s.gitBranch ?? null,
      room: record?.room ?? null,
      updatedAt: s.lastModified,
      href: record ? roomHref(record.room, record.id) : `/?s=${encodeURIComponent(s.sessionId)}`,
      pinKey: `s:${s.sessionId}`,
      pinned: pins.has(`s:${s.sessionId}`),
    };
  });
  const listed = new Set(infos.map((s) => s.sessionId));
  for (const r of records) {
    if (r.sdkSessionId && listed.has(r.sdkSessionId)) continue;
    if (r.sdkSessionId && !FAKE) continue; // a session outside the listing window
    entries.push({
      sessionId: r.sdkSessionId ?? null, title: r.title, cwd: r.cwd ?? null, project: r.cwd ? path.basename(r.cwd) : null,
      branch: null, room: r.room, updatedAt: r.updatedAt, href: roomHref(r.room, r.id),
      pinKey: r.sdkSessionId ? `s:${r.sdkSessionId}` : `c:${r.id}`,
      pinned: pins.has(r.sdkSessionId ? `s:${r.sdkSessionId}` : `c:${r.id}`),
    });
  }
  // Pinned chats always make the list, even when older than the listing window.
  const sorted = entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return [...sorted.filter((e) => e.pinned), ...sorted.filter((e) => !e.pinned).slice(0, limit)];
}

/**
 * Opens a chat by app conversation id or by Claude Code session id. A CLI session gets an app
 * record (Home room, its own cwd) so new messages resume that same session.
 */
export async function openHistory(by: { conversationId?: string; sessionId?: string }): Promise<OpenedHistory | null> {
  let record = by.conversationId ? sessions.get(by.conversationId) : sessions.list().find((r) => r.sdkSessionId === by.sessionId);
  const sessionId = record?.sdkSessionId ?? by.sessionId;
  if (!sessionId) return record ? { conversationId: record.id, room: record.room, title: record.title, cwd: record.cwd ?? null, items: [], updatedAt: 0 } : null;

  const fakeInfo = FAKE_SESSIONS.find((s) => s.sessionId === sessionId);
  const info = FAKE ? fakeInfo : await (await sdk()).getSessionInfo(sessionId);
  if (!info) return record ? { conversationId: record.id, room: record.room, title: record.title, cwd: record.cwd ?? null, items: [], updatedAt: 0 } : null;

  if (!record) {
    record = sessions.upsert({ id: randomUUID(), room: "home", title: sessionTitle(info), sdkSessionId: sessionId, cwd: info.cwd });
  }
  const messages = FAKE ? FAKE_MESSAGES : await (await sdk()).getSessionMessages(sessionId);
  return {
    conversationId: record.id,
    room: record.room,
    title: record.title,
    cwd: record.cwd ?? info.cwd ?? null,
    items: historyToItems(messages as never).slice(-MAX_ITEMS),
    updatedAt: info.lastModified,
  };
}
