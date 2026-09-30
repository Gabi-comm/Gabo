import { rejectForeign } from "@/server/guard";
import { continueInNewSession, NewSessionError } from "@/server/newSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared with /api/run: a chat that is mid-run can't be copied yet.
const g = globalThis as unknown as { __gaboActive?: Set<string> };
const active = (g.__gaboActive ??= new Set());

/** POST { conversationId } → compacts a copy of the chat into a new chat: { conversationId, href, title }. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { conversationId?: unknown };
  const id = body.conversationId;
  if (typeof id !== "string" || !/^[\w-]{1,64}$/.test(id)) return Response.json({ error: "Bad conversationId." }, { status: 400 });
  if (active.has(id)) return Response.json({ error: "Wait for Claude to finish, then start the new session." }, { status: 409 });
  active.add(id);
  try {
    return Response.json(await continueInNewSession(id, req.signal));
  } catch (err) {
    const status = err instanceof NewSessionError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  } finally {
    active.delete(id);
  }
}
