// Other AIs Claude can consult (ChatGPT, Gemini, OpenClaw, Hermes, any OpenAI-compatible endpoint).
// Exposed to Claude as MCP tools (see aiTools.ts); this file only knows how to talk to them.

export type ProviderKind = "openai" | "gemini" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
  /** Shown on the Plugins page: where to get a key or what URL to use. */
  help: string;
}

/** Model names are starting points; Gab sets the ones his accounts have. */
export const PRESETS: ProviderConfig[] = [
  { id: "chatgpt", label: "ChatGPT", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", enabled: false, help: "API key from platform.openai.com → API keys (billed by OpenAI, separate from a ChatGPT Plus plan)." },
  { id: "gemini", label: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", enabled: false, help: "API key from aistudio.google.com → Get API key." },
  { id: "openclaw", label: "OpenClaw", kind: "openai-compatible", baseUrl: "http://127.0.0.1:18789/v1", model: "openclaw", enabled: false, help: "Your OpenClaw gateway's OpenAI-compatible endpoint (enable it in the gateway) and its token, if it uses one." },
  { id: "hermes", label: "Hermes", kind: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "nousresearch/hermes-4-405b", enabled: false, help: "Nous Research Hermes via OpenRouter (key from openrouter.ai), or a local server such as Ollama at http://127.0.0.1:11434/v1 with no key." },
  { id: "custom", label: "Custom", kind: "openai-compatible", baseUrl: "http://127.0.0.1:1234/v1", model: "local-model", enabled: false, help: "Any OpenAI-compatible server: LM Studio, vLLM, Groq, Together, DeepSeek…" },
];

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MODEL = /^[\w.:/@-]{1,100}$/;
const LABEL = /^[\w .()'-]{1,40}$/;

export function isLocal(baseUrl: string): boolean {
  try { return LOCAL_HOSTS.has(new URL(baseUrl).hostname); } catch { return false; }
}

/** Null when fine. Plain http is only allowed to this machine, so keys never cross the network unencrypted. */
export function validateProvider(p: Pick<ProviderConfig, "baseUrl" | "model" | "label">): string | null {
  let url: URL;
  try { url = new URL(p.baseUrl); } catch { return "The base URL must be an https:// address (or http:// on this machine)."; }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local))) return "The base URL must be an https:// address (or http:// on this machine).";
  if (!MODEL.test(p.model)) return "The model name can use letters, numbers and . : / @ - only.";
  if (!LABEL.test(p.label)) return "Keep the name short: letters, numbers, spaces.";
  return null;
}

export function maskKey(key: string | undefined): string {
  return key ? `••••${key.slice(-4)}` : "";
}

/** Providers Claude can call right now: switched on, and with a key unless the endpoint is on this machine. */
export function usableProviders(list: ProviderConfig[]): ProviderConfig[] {
  return list.filter((p) => p.enabled && (p.apiKey || isLocal(p.baseUrl)) && !validateProvider(p));
}

export interface AskInput { prompt: string; system?: string }

const TIMEOUT_MS = 120_000;
const MAX_REPLY = 30_000;

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j?.error?.message ?? j?.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Sends one prompt to the provider and returns its text answer. */
export async function askProvider(p: ProviderConfig, input: AskInput, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  const base = p.baseUrl.replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  let pick: (j: unknown) => string;

  if (p.kind === "gemini") {
    res = await fetchImpl(`${base}/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: "POST",
      signal: combined,
      headers: { "Content-Type": "application/json", "x-goog-api-key": p.apiKey ?? "" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
      }),
    });
    pick = (j) => ((j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "").join("");
  } else {
    res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      signal: combined,
      headers: { "Content-Type": "application/json", ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}) },
      body: JSON.stringify({
        model: p.model,
        messages: [...(input.system ? [{ role: "system", content: input.system }] : []), { role: "user", content: input.prompt }],
      }),
    });
    pick = (j) => {
      const content = (j as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
      return typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : "";
    };
  }

  if (!res.ok) throw new Error(`${p.label} answered ${res.status}: ${await readError(res)}`);
  const text = pick(await res.json()).trim();
  if (!text) throw new Error(`${p.label} returned an empty answer.`);
  return text.length > MAX_REPLY ? `${text.slice(0, MAX_REPLY)}\n…(cut at ${MAX_REPLY.toLocaleString()} characters)` : text;
}
