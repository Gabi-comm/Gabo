import { rejectForeign } from "@/server/guard";
import { DEFAULT_WORKSPACE, FAKE, getWorkspace, setWorkspace, validateWorkspace } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json({ workspace: FAKE ? "C:/fake/workspace" : getWorkspace(), default: DEFAULT_WORKSPACE, fake: FAKE });
}

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const check = validateWorkspace(body.path);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  setWorkspace(check.path);
  return Response.json({ workspace: check.path });
}
