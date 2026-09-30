import { rejectForeign } from "@/server/guard";
import { sessions } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(sessions.list().map(({ id, room, title, updatedAt }) => ({ id, room, title, updatedAt })));
}

export async function DELETE(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Need ?id=" }, { status: 400 });
  sessions.remove(id);
  return Response.json({ ok: true });
}
