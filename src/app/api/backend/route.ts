import { PROVIDERS, type ModelTiers, type ProviderId } from "@/harness/backend";
import { rejectForeign } from "@/server/guard";
import { disconnect, keyFor, publicBackend, saveConnection } from "@/server/backend";
import { checkKey } from "@/server/backendTest";
import { saveLocal } from "@/server/localLlm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProvider = (v: unknown): v is ProviderId => typeof v === "string" && v in PROVIDERS;

/** GET → which account runs Gabo (keys masked). */
export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(publicBackend());
}

/** PUT { provider, apiKey?, tiers? } → checks the key with the provider, then makes it the connection. */
export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { provider?: unknown; apiKey?: unknown; tiers?: Partial<ModelTiers> };
  if (!isProvider(body.provider)) return Response.json({ error: "Pick Claude, OpenAI or Gemini." }, { status: 400 });
  const key = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : keyFor(body.provider);
  if (!key) return Response.json({ error: `Paste your ${PROVIDERS[body.provider].label} API key.` }, { status: 400 });
  const check = await checkKey(body.provider, key);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  try {
    saveConnection({ provider: body.provider, apiKey: key, tiers: body.tiers });
    // A connected account takes over from the Local LLM.
    saveLocal({ enabled: false });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  return Response.json({ ...publicBackend(), models: check.models });
}

/** DELETE → not connected (the pop-up shows again). ?keys=1 also forgets the saved keys. */
export async function DELETE(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  disconnect(new URL(req.url).searchParams.get("keys") === "1");
  return Response.json(publicBackend());
}
