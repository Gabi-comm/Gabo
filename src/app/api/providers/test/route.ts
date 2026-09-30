import { askProvider } from "@/harness/providers";
import { rejectForeign } from "@/server/guard";
import { FAKE } from "@/server/config";
import { PROVIDERS_FILE, loadProviders } from "@/server/providers";

export const runtime = "nodejs";

/** Sends a tiny prompt to one provider to prove the key, URL and model work. */
export async function POST(req: Request) {
  const denied = rejectForeign(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const p = loadProviders(PROVIDERS_FILE).find((x) => x.id === body.id);
  if (!p) return Response.json({ error: "Unknown provider." }, { status: 400 });
  const started = Date.now();
  if (FAKE) return Response.json({ ok: true, reply: `OK (fake ${p.label})`, ms: 5 });
  try {
    const reply = await askProvider(p, { prompt: "Reply with exactly: OK" });
    return Response.json({ ok: true, reply: reply.slice(0, 200), ms: Date.now() - started });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
  }
}
