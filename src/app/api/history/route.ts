import { rejectForeign } from "@/server/guard";
import { listHistory, openHistory } from "@/server/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[\w-]{1,64}$/;

/** GET /api/history → the unified list. GET /api/history?c=<conversation>|s=<session> → one chat's transcript. */
export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const c = url.searchParams.get("c");
  const s = url.searchParams.get("s");
  try {
    if (!c && !s) return Response.json(await listHistory());
    if ((c && !ID.test(c)) || (s && !ID.test(s))) return Response.json({ error: "Bad id." }, { status: 400 });
    const opened = await openHistory({ conversationId: c ?? undefined, sessionId: s ?? undefined });
    return opened ? Response.json(opened) : Response.json({ error: "That session doesn't exist anymore." }, { status: 404 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
