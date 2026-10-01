import { timingSafeEqual } from "node:crypto";
import { mapModel, PROVIDERS } from "@/harness/backend";
import { StreamTranslator, ToolNames, anthropicError, fromOpenAI, roughTokens, toOpenAI, type AnthropicRequest, type Upstream } from "@/harness/translate";
import { keyFor, tiersFor, translateSecret } from "./backend";

/** Real endpoints; GABO_UPSTREAM_OPENAI / _GEMINI override them (tests point them at Ollama's OpenAI API). */
const UPSTREAM: Record<Upstream, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};
const upstreamBase = (u: Upstream) => process.env[`GABO_UPSTREAM_${u.toUpperCase()}`] || UPSTREAM[u];

export function upstreamOf(url: string): Upstream | null {
  const m = /\/api\/translate\/(openai|gemini)\//.exec(new URL(url).pathname);
  return (m?.[1] as Upstream | undefined) ?? null;
}

/** Only Claude Code processes started by this server know the secret. */
export function authorized(req: Request): boolean {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || req.headers.get("x-api-key") || "";
  const want = translateSecret();
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const errorResponse = (status: number, message: string) => Response.json(anthropicError(status, message), { status });

export async function countTokens(req: Request): Promise<Response> {
  if (!authorized(req)) return errorResponse(401, "Gabo translator: bad token.");
  return Response.json({ input_tokens: roughTokens(await req.json().catch(() => ({}))) });
}

export async function messages(req: Request): Promise<Response> {
  const upstream = upstreamOf(req.url);
  if (!upstream) return errorResponse(404, "Unknown provider.");
  if (!authorized(req)) return errorResponse(401, "Gabo translator: bad token.");
  const provider = PROVIDERS[upstream];
  const key = keyFor(provider.id);
  if (!key) return errorResponse(401, `No ${provider.label} API key saved. Connect again.`);
  let body: AnthropicRequest;
  try { body = await req.json(); } catch { return errorResponse(400, "Body must be JSON."); }

  const model = mapModel(String(body.model ?? ""), tiersFor(provider.id));
  const names = new ToolNames();
  const payload = toOpenAI(body, upstream, model, names);
  let res: Response;
  try {
    res = await fetch(`${upstreamBase(upstream)}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: req.signal,
    });
  } catch (err) {
    return errorResponse(502, `${provider.label} couldn't be reached: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text.slice(0, 600);
    try {
      const j = JSON.parse(text);
      message = (Array.isArray(j) ? j[0]?.error?.message : j?.error?.message) ?? message;
    } catch { /* not JSON */ }
    return errorResponse(res.status, `${provider.label}: ${message || res.statusText}`);
  }

  if (!body.stream) return Response.json(fromOpenAI(await res.json(), model, names));

  const t = new StreamTranslator(model, names);
  const enc = new TextEncoder();
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let buf = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const out = t.push(JSON.parse(data));
              if (out) ctrl.enqueue(enc.encode(out));
            } catch { /* skip a malformed chunk */ }
          }
        }
        ctrl.enqueue(enc.encode(t.end()));
      } catch (err) {
        const e = anthropicError(502, `${provider.label} stream broke: ${err instanceof Error ? err.message : String(err)}`);
        ctrl.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify(e)}\n\n`));
      } finally {
        ctrl.close();
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
