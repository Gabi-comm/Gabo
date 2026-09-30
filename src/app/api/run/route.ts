import { randomUUID } from "node:crypto";
import { isRoomId } from "@/harness/rooms";
import { broker } from "@/harness/permissions";
import { fakeRun, runRoom } from "@/harness/runner";
import type { UiEvent } from "@/harness/events";
import { rejectForeign } from "@/server/guard";
import { FAKE, getWorkspace, sessions } from "@/server/config";
import { prepareSkills } from "@/server/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT = 100_000;
const g = globalThis as unknown as { __gaboActive?: Set<string> };
const active = (g.__gaboActive ??= new Set());

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;

  let body: { conversationId?: unknown; room?: unknown; prompt?: unknown; full?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const { conversationId, room, prompt } = body;
  if (typeof conversationId !== "string" || !/^[\w-]{1,64}$/.test(conversationId)) {
    return Response.json({ error: "Bad conversationId." }, { status: 400 });
  }
  if (!isRoomId(room)) return Response.json({ error: "Unknown room." }, { status: 400 });
  if (typeof prompt !== "string" || prompt.trim() === "") return Response.json({ error: "Say something first." }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Prompt is over ${MAX_PROMPT.toLocaleString()} characters.` }, { status: 413 });
  if (active.has(conversationId)) return Response.json({ error: "A run is already going in this chat." }, { status: 409 });

  active.add(conversationId);
  const existing = sessions.get(conversationId);
  const record = existing ?? sessions.upsert({ id: conversationId, room, title: prompt.trim().slice(0, 60) });
  const runId = randomUUID();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: UiEvent) => {
        if (closed) return;
        if (e.type === "session" && !FAKE) sessions.upsert({ id: conversationId, sdkSessionId: e.sessionId });
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; }
      };
      try {
        if (FAKE) {
          await fakeRun({
            room, prompt, emit, signal: abort.signal,
            ask: (tool, summary) => broker.request(runId, { tool, summary, input: {} }, (r) =>
              emit({ type: "permission_request", requestId: r.requestId, tool, summary })),
          });
        } else {
          const workspace = getWorkspace();
          const skillsByAgent = await prepareSkills({ conversationId, room, prompt, workspace, firstTurn: !existing?.sdkSessionId, emit, signal: abort.signal });
          await runRoom({
            runId, conversationId, room, prompt, workspace, emit, signal: abort.signal,
            sessionId: record.sdkSessionId, skillsByAgent, fullArena: body.full === true,
          });
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
        emit({ type: "done" });
      } finally {
        active.delete(conversationId);
        broker.cancelRun(runId);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
