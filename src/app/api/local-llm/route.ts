import { rejectForeign } from "@/server/guard";
import { loadLocal, ollamaStatus, saveLocal } from "@/server/localLlm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const config = loadLocal();
  return Response.json({ config, ollama: await ollamaStatus(config.baseUrl) });
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.baseUrl === "string") patch.baseUrl = body.baseUrl.slice(0, 200);
  if (typeof body.model === "string") patch.model = body.model.slice(0, 100);
  try {
    const config = saveLocal(patch);
    return Response.json({ config, ollama: await ollamaStatus(config.baseUrl) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
