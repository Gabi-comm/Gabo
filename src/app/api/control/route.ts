import { isMode } from "@/harness/controls";
import { liveQueries } from "@/harness/runner";
import { rejectForeign } from "@/server/guard";
import { FAKE } from "@/server/config";

export const runtime = "nodejs";

/** Mid-run changes, like pressing Shift+Tab or /model in the CLI while Claude is working. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.conversationId !== "string") return Response.json({ error: "Need conversationId." }, { status: 400 });
  if (body.mode !== undefined && !isMode(body.mode)) return Response.json({ error: "Unknown mode." }, { status: 400 });
  if (body.model !== undefined && (typeof body.model !== "string" || !/^[\w.:\-[\]]{1,80}$/.test(body.model))) {
    return Response.json({ error: "Bad model name." }, { status: 400 });
  }
  if (FAKE) return Response.json({ ok: true, live: false });
  const live = liveQueries.get(body.conversationId);
  if (!live) return Response.json({ ok: true, live: false });
  try {
    if (body.mode) await live.setPermissionMode(body.mode);
    if (body.model) await live.setModel(body.model === "default" ? undefined : body.model);
    return Response.json({ ok: true, live: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
