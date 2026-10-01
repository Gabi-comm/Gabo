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

export interface LocalTest { ok: boolean; reply?: string; error?: string; ms: number; toolCall: boolean }

/**
 * One small message through Ollama's Anthropic-compatible API (the path Claude Code uses) that must come
 * back as a tool call: Gabo's agents need tool calls for skills, files and plugins.
 */
export async function testLocal(c: LocalLlmConfig): Promise<LocalTest> {
  const started = Date.now();
  if (FAKE) return { ok: true, reply: `called read_note (fake ${c.model})`, ms: 5, toolCall: true };
  try {
    const res = await fetch(`${c.baseUrl}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(240_000),
      headers: { "Content-Type": "application/json", "x-api-key": "ollama", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: c.model, max_tokens: 300,
        tools: [{ name: "read_note", description: "Read a note by its title.", input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } }],
        messages: [{ role: "user", content: "Use the read_note tool to read the note titled \"Groceries\". Do not answer in text." }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}`, ms: Date.now() - started, toolCall: false };
    const blocks = (body?.content ?? []) as { type: string; text?: string; name?: string; input?: Record<string, unknown> }[];
    const call = blocks.find((b) => b.type === "tool_use");
    const text = blocks.map((b) => b.text ?? "").join("").trim();
    return call
      ? { ok: true, reply: `called ${call.name}(${JSON.stringify(call.input ?? {})})`, ms: Date.now() - started, toolCall: true }
      : { ok: true, reply: text ? `answered in text instead of calling the tool: "${text.slice(0, 120)}"` : "(empty reply)", ms: Date.now() - started, toolCall: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started, toolCall: false };
  }
}

export interface ModelDetails {
  /** num_ctx the model runs with; null = Ollama's default (small: about 4k). */
  contextWindow: number | null;
  /** The most the model supports. */
  maxContext: number | null;
  tools: boolean;
  capabilities: string[];
}

/** Context window and tool support, from `ollama show` (instant: no generation). */
export async function modelDetails(baseUrl: string, model: string): Promise<ModelDetails> {
  if (FAKE) return { contextWindow: model.includes("gabo") ? 32768 : null, maxContext: 40960, tools: true, capabilities: ["completion", "tools"] };
  const res = await fetch(`${baseUrl}/api/show`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Ollama answered ${res.status} for ${model}.`);
  const d = (await res.json()) as { capabilities?: string[]; parameters?: string; model_info?: Record<string, unknown> };
  const num = /(?:^|\n)\s*num_ctx\s+(\d+)/.exec(d.parameters ?? "");
  const maxKey = Object.keys(d.model_info ?? {}).find((k) => k.endsWith(".context_length"));
  const caps = d.capabilities ?? [];
  return { contextWindow: num ? Number(num[1]) : null, maxContext: maxKey ? Number(d.model_info![maxKey]) : null, tools: caps.includes("tools"), capabilities: caps };
}

/** The name Gabo gives a model copy with a bigger context window, e.g. qwen3:8b -> qwen3-8b-gabo-32k. */
export function preparedName(model: string, numCtx: number): string {
  const base = model.replace(/:latest$/, "").replace(/-gabo-\d+k$/, "").replace(/[:/]/g, "-");
  return `${base}-gabo-${Math.round(numCtx / 1024)}k`;
}

/** `ollama create` a copy of the model with num_ctx set, so Claude Code's long prompt isn't cut off. */
export async function prepareModel(baseUrl: string, model: string, numCtx: number): Promise<string> {
  const name = preparedName(model, numCtx);
  if (FAKE) return name;
  const res = await fetch(`${baseUrl}/api/create`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name, from: model, parameters: { num_ctx: numCtx }, stream: false }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error ?? `Ollama answered ${res.status}.`);
  return name;
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
