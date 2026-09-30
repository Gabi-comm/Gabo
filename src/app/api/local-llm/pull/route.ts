import { rejectForeign } from "@/server/guard";
import { loadLocal, pullModel } from "@/server/localLlm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {model} → Ollama's pull progress, newline-delimited JSON, streamed through. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.model !== "string" || !/^[\w.:/-]{1,100}$/.test(body.model)) return Response.json({ error: "Bad model name." }, { status: 400 });
  try {
    const stream = await pullModel(loadLocal().baseUrl, body.model);
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
