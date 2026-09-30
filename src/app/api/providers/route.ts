import { rejectForeign } from "@/server/guard";
import { PROVIDERS_FILE, loadProviders, publicProviders, saveProvider, type ProviderPatch } from "@/server/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Other-AI connections for the Plugins page. Keys are write-only: the browser only ever sees "••••1234". */
export async function GET(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  return Response.json(publicProviders(loadProviders(PROVIDERS_FILE)));
}

export async function PUT(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string") return Response.json({ error: "Need id." }, { status: 400 });
  const patch: ProviderPatch = {};
  for (const k of ["label", "baseUrl", "model", "apiKey"] as const) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== "string" || (body[k] as string).length > 4000) return Response.json({ error: `Bad ${k}.` }, { status: 400 });
    patch[k] = body[k] as string;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return Response.json({ error: "Bad enabled." }, { status: 400 });
    patch.enabled = body.enabled;
  }
  try {
    saveProvider(PROVIDERS_FILE, body.id, patch);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  return Response.json(publicProviders(loadProviders(PROVIDERS_FILE)).find((p) => p.id === body.id));
}
