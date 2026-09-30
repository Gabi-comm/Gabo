import { broker } from "@/harness/permissions";
import { rejectForeign } from "@/server/guard";

export const runtime = "nodejs";

const DECISIONS = new Set(["allow", "allow_session", "deny"]);

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.requestId !== "string" || !DECISIONS.has(body.decision)) {
    return Response.json({ error: "Need requestId and decision (allow, allow_session, deny)." }, { status: 400 });
  }
  const ok = broker.resolve(body.requestId, body.decision);
  return ok ? Response.json({ ok }) : Response.json({ error: "That request already expired." }, { status: 404 });
}
