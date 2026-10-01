import { PROVIDERS, type ProviderId } from "@/harness/backend";
import { FAKE } from "./config";

export interface KeyCheck { ok: boolean; models: string[]; error?: string }

/** Checks a key by listing the provider's models: free, and it gives the model picker real names. */
export async function checkKey(id: ProviderId, key: string): Promise<KeyCheck> {
  const p = PROVIDERS[id];
  if (!p.keyPattern.test(key)) return { ok: false, models: [], error: `That doesn't look like a ${p.label} API key (${p.keyHint}).` };
  if (FAKE) {
    if (key.includes("bad")) return { ok: false, models: [], error: `${p.label} rejected the key (401).` };
    return { ok: true, models: Object.values(p.tiers) };
  }
  const req: { url: string; headers: Record<string, string> } = id === "claude"
    ? { url: "https://api.anthropic.com/v1/models?limit=100", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }
    : { url: `${id === "openai" ? "https://api.openai.com/v1" : "https://generativelanguage.googleapis.com/v1beta/openai"}/models`, headers: { Authorization: `Bearer ${key}` } };
  try {
    const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (Array.isArray(body) ? body[0]?.error?.message : body?.error?.message) ?? res.statusText;
      return { ok: false, models: [], error: `${p.label} rejected the key (${res.status}): ${msg}` };
    }
    const models = ((body?.data ?? []) as { id: string }[]).map((m) => m.id.replace(/^models\//, ""))
      .filter((m) => (id === "openai" ? /^(gpt|o\d)/.test(m) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(m) : id === "gemini" ? /^gemini/.test(m) && !/(embedding|tts|image|live)/.test(m) : true))
      .sort();
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: `${p.label} couldn't be reached: ${err instanceof Error ? err.message : String(err)}` };
  }
}
