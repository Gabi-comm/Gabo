import { PROVIDERS, type ProviderId } from "@/harness/backend";
import { rejectForeign } from "@/server/guard";
import { keyFor } from "@/server/backend";
import { checkKey } from "@/server/backendTest";

export const runtime = "nodejs";

/** POST { provider, apiKey? } → { ok, models, error } without saving. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { provider?: unknown; apiKey?: unknown };
  if (typeof body.provider !== "string" || !(body.provider in PROVIDERS)) return Response.json({ ok: false, models: [], error: "Pick Claude, OpenAI or Gemini." });
  const id = body.provider as ProviderId;
  const key = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : keyFor(id);
  if (!key) return Response.json({ ok: false, models: [], error: "Paste a key first." });
  return Response.json(await checkKey(id, key));
}
