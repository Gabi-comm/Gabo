import { rejectForeign } from "@/server/guard";
import { getStatus } from "@/server/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(await getStatus(new URL(req.url).searchParams.get("refresh") === "1"));
}
