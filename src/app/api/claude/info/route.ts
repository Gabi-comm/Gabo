import { rejectForeign } from "@/server/guard";
import { getClaudeInfo } from "@/server/claudeInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  try {
    return Response.json(await getClaudeInfo(new URL(req.url).searchParams.get("refresh") === "1"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
