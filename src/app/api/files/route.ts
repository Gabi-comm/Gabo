import { findFiles } from "@/harness/files";
import { rejectForeign } from "@/server/guard";
import { FAKE, getWorkspace, sessions, validateWorkspace } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAKE_FILES = ["notes.md", "README.md", "src/app/page.tsx", "src/auth/login.ts"];

/** GET /api/files?c=<conversation>&q=<text> → workspace files for @ mentions. */
export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 200);
  if (FAKE) return Response.json(FAKE_FILES.filter((f) => f.toLowerCase().includes(q.toLowerCase())));
  const c = url.searchParams.get("c");
  const record = c ? sessions.get(c) : undefined;
  const own = record?.cwd ? validateWorkspace(record.cwd) : null;
  return Response.json(findFiles(own?.ok ? own.path : getWorkspace(), q));
}
