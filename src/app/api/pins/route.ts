import { rejectForeign } from "@/server/guard";
import { PINS_FILE, loadPins, setPinned } from "@/server/pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(loadPins(PINS_FILE));
}

/** POST {key: "s:<session>" | "c:<chat>", pinned: boolean} */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.key !== "string" || typeof body.pinned !== "boolean") return Response.json({ error: "Need key and pinned." }, { status: 400 });
  try {
    return Response.json(setPinned(PINS_FILE, body.key, body.pinned));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
