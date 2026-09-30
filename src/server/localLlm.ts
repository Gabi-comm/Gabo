import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LOCAL, validateLocal, type LocalLlmConfig } from "@/harness/localLlm";
import { DATA_DIR, FAKE } from "./config";

export const LOCAL_FILE = path.join(DATA_DIR, "local-llm.json");

export function loadLocal(file = LOCAL_FILE): LocalLlmConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const c = { ...DEFAULT_LOCAL, ...raw } as LocalLlmConfig;
    return validateLocal(c) ? { ...c, enabled: false } : c;
  } catch {
    return { ...DEFAULT_LOCAL };
  }
}

export function saveLocal(patch: Partial<LocalLlmConfig>, file = LOCAL_FILE): LocalLlmConfig {
  const next: LocalLlmConfig = { ...loadLocal(file), ...patch };
  next.baseUrl = next.baseUrl.trim().replace(/\/+$/, "");
  next.model = next.model.trim();
  const problem = validateLocal(next);
  if (problem) throw new Error(problem);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export interface OllamaModel { name: string; size: number; parameterSize?: string; family?: string }
export interface OllamaStatus { running: boolean; version?: string; models: OllamaModel[]; error?: string }

const FAKE_MODELS: OllamaModel[] = [
  { name: "qwen3-coder:30b", size: 18_600_000_000, parameterSize: "30.5B", family: "qwen3moe" },
  { name: "gpt-oss:20b", size: 13_800_000_000, parameterSize: "20.9B", family: "gptoss" },
];

export async function ollamaStatus(baseUrl: string): Promise<OllamaStatus> {
  if (FAKE) return { running: true, version: "0.31.1", models: FAKE_MODELS };
  try {
    const [v, tags] = await Promise.all([
      fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
      fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
    ]);
    type Tag = { name: string; size: number; details?: { parameter_size?: string; family?: string } };
    const models = ((tags?.models ?? []) as Tag[]).map((m) => ({ name: m.name, size: m.size, parameterSize: m.details?.parameter_size, family: m.details?.family }));
    return { running: true, version: v?.version, models };
  } catch (err) {
    return { running: false, models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** One tiny message through Ollama's Anthropic-compatible API: the same path Claude Code will use. */
export async function testLocal(c: LocalLlmConfig): Promise<{ ok: boolean; reply?: string; error?: string; ms: number }> {
  const started = Date.now();
  if (FAKE) return { ok: true, reply: `OK (fake ${c.model})`, ms: 5 };
  try {
    const res = await fetch(`${c.baseUrl}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: { "Content-Type": "application/json", "x-api-key": "ollama", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: c.model, max_tokens: 20, messages: [{ role: "user", content: "Reply with exactly: OK" }] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, ms: Date.now() - started };
    const reply = ((body?.content ?? []) as { type: string; text?: string }[]).map((b) => b.text ?? "").join("").trim();
    return { ok: true, reply: reply || "(empty reply)", ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

/** Starts `ollama pull` through the API and returns its newline-delimited JSON progress. */
export async function pullModel(baseUrl: string, model: string): Promise<ReadableStream<Uint8Array>> {
  if (FAKE) {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(ctrl) {
        for (const pct of [0, 50, 100]) ctrl.enqueue(enc.encode(`${JSON.stringify({ status: pct === 100 ? "success" : "pulling", completed: pct, total: 100 })}\n`));
        ctrl.close();
      },
    });
  }
  const res = await fetch(`${baseUrl}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: true }) });
  if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}.`);
  return res.body;
}
