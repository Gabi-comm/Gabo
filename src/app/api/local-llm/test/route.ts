import { rejectForeign } from "@/server/guard";
import { loadLocal, testLocal } from "@/server/localLlm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const config = { ...loadLocal(), ...(typeof body.model === "string" && body.model ? { model: body.model } : {}) };
  if (!config.model) return Response.json({ ok: false, error: "Pick a model first.", ms: 0 });
  return Response.json(await testLocal(config));
}
