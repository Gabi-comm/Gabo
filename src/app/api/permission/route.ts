import { broker, pendingAnswers } from "@/harness/permissions";
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
  if (body.answers !== undefined) {
    const a = body.answers;
    const valid = a && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length <= 8 &&
      Object.entries(a).every(([k, v]) => k.length <= 500 && typeof v === "string" && v.length <= 2000);
    if (!valid) return Response.json({ error: "Answers must map each question to text." }, { status: 400 });
    pendingAnswers.set(body.requestId, a as Record<string, string>);
  }
  const ok = broker.resolve(body.requestId, body.decision);
  if (!ok) pendingAnswers.delete(body.requestId);
  return ok ? Response.json({ ok }) : Response.json({ error: "That request already expired." }, { status: 404 });
}
