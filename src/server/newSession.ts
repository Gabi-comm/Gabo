import { randomUUID } from "node:crypto";
import { isLocalOn, localEnv } from "@/harness/localLlm";
import { roomHref } from "@/lib/routes";
import { FAKE, getWorkspace, sessions } from "./config";
import type { SessionRecord } from "./sessions";
import { loadLocal } from "./localLlm";

export interface NewSessionResult { conversationId: string; href: string; title: string }

export class NewSessionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** The fake id marks a compacted copy so fake-mode history can show a summary for it. */
export const FAKE_COMPACT_PREFIX = "fake-compact-";

const continuedTitle = (t: string) => `${t.replace(/ \(continued\)$/, "")} (continued)`.slice(0, 80);

/**
 * "New session" under the prompt box: copy the chat's Claude Code session (the original stays as it is),
 * run /compact on the copy, and save the copy as a new chat. Its next message resumes from the compact
 * summary, so it no longer re-reads the whole old conversation on every call.
 */
export async function continueInNewSession(conversationId: string, signal?: AbortSignal): Promise<NewSessionResult> {
  const record = sessions.get(conversationId);
  if (!record) throw new NewSessionError("That chat doesn't exist anymore.", 404);
  if (!record.sdkSessionId) throw new NewSessionError("Send a message first; there's nothing to carry over yet.", 400);

  const sdkSessionId = FAKE ? `${FAKE_COMPACT_PREFIX}${record.sdkSessionId}` : await forkAndCompact(record, signal);
  const next = sessions.upsert({
    id: randomUUID(),
    room: record.room,
    title: continuedTitle(record.title),
    sdkSessionId,
    continuedFrom: record.title,
    ...(record.cwd ? { cwd: record.cwd } : {}),
    ...(record.team ? { team: record.team } : {}),
    ...(record.skills ? { skills: record.skills } : {}),
  });
  return { conversationId: next.id, href: roomHref(next.room, next.id), title: next.title };
}

async function forkAndCompact(record: SessionRecord, signal?: AbortSignal): Promise<string> {
  const { deleteSession, forkSession, query } = await import("@anthropic-ai/claude-agent-sdk");
  const cwd = record.cwd ?? getWorkspace();
  const { sessionId } = await forkSession(record.sdkSessionId!, { title: continuedTitle(record.title) });
  const local = loadLocal();
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const q = query({
      prompt: "/compact",
      options: {
        cwd,
        resume: sessionId,
        abortController,
        ...(isLocalOn(local) ? { model: local.model, env: { ...process.env, ...localEnv(local) } } : {}),
      },
    });
    let compacted = false;
    let said = "";
    for await (const m of q) {
      if (m.type === "system" && m.subtype === "compact_boundary") compacted = true;
      if (m.type === "system" && m.subtype === "local_command_output") said = String((m as { content?: unknown }).content ?? "");
      if (m.type === "result") {
        if (m.subtype !== "success" && !compacted) throw new NewSessionError(`Compacting failed: ${("errors" in m && m.errors?.join("; ")) || m.subtype}.`, 502);
        break;
      }
    }
    if (!compacted) throw new NewSessionError(said.trim() || "Claude Code didn't compact the chat.", 502);
    return sessionId;
  } catch (err) {
    // Don't leave a half-made copy behind in History.
    await deleteSession(sessionId).catch(() => {});
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
