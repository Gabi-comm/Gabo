import { rejectForeign } from "@/server/guard";
import { testConnector } from "@/server/connectors";

export const runtime = "nodejs";

/** POST { id } → starts the plugin, lists its tools, stops it. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !/^(notion|obsidian|c-[a-z0-9-]{1,40})$/.test(body.id)) return Response.json({ ok: false, tools: [], error: "Unknown plugin.", ms: 0 });
  return Response.json(await testConnector(body.id));
}
