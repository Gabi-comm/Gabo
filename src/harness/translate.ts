// Anthropic Messages API <-> OpenAI Chat Completions. Lets Claude Code (and so every Gabo agent) run on an
// OpenAI or Gemini API key: Claude Code talks Anthropic to /api/translate, which talks OpenAI upstream.
// Gemini is reached through its OpenAI-compatible endpoint. Pure functions; the route does the I/O.

export type Upstream = "openai" | "gemini";

type Json = Record<string, unknown>;
type Block = Json & { type: string };

export interface AnthropicRequest {
  model: string;
  system?: string | Block[];
  messages: { role: "user" | "assistant"; content: string | Block[] }[];
  tools?: (Json & { name: string; description?: string; input_schema?: Json; type?: string })[];
  tool_choice?: { type: "auto" | "any" | "tool" | "none"; name?: string };
  max_tokens?: number;
  temperature?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

/** OpenAI function names: ^[a-zA-Z0-9_-]{1,64}$. Longer or odd names get a stable short alias. */
export class ToolNames {
  private toShort = new Map<string, string>();
  private toLong = new Map<string, string>();
  alias(name: string): string {
    const hit = this.toShort.get(name);
    if (hit) return hit;
    let short = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (short.length > 64) short = `${short.slice(0, 55)}_${hash(name)}`;
    this.toShort.set(name, short);
    this.toLong.set(short, name);
    return short;
  }
  original(short: string): string {
    return this.toLong.get(short) ?? short;
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).padStart(8, "0").slice(0, 8);
}

/** JSON Schema keywords the OpenAI-compatible endpoints reject or mishandle. */
const DROP_KEYS: Record<Upstream, Set<string>> = {
  openai: new Set(["$schema"]),
  gemini: new Set(["$schema", "additionalProperties", "propertyNames", "$id", "$ref", "$defs", "definitions", "examples", "default", "const", "exclusiveMinimum", "exclusiveMaximum", "patternProperties"]),
};

export function cleanSchema(schema: unknown, upstream: Upstream): unknown {
  if (Array.isArray(schema)) return schema.map((s) => cleanSchema(s, upstream));
  if (!schema || typeof schema !== "object") return schema;
  const out: Json = {};
  for (const [k, v] of Object.entries(schema as Json)) {
    if (DROP_KEYS[upstream].has(k)) continue;
    // Gemini only knows a few string formats.
    if (upstream === "gemini" && k === "format" && !["enum", "date-time"].includes(String(v))) continue;
    out[k] = k === "properties" && v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v as Json).map(([p, s]) => [p, cleanSchema(s, upstream)]))
      : cleanSchema(v, upstream);
  }
  return out;
}

const textOf = (content: string | Block[] | undefined): string =>
  typeof content === "string" ? content : (content ?? []).filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");

function imagePart(b: Block): Json | null {
  const src = b.source as Json | undefined;
  if (!src) return null;
  if (src.type === "base64") return { type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } };
  if (src.type === "url") return { type: "image_url", image_url: { url: src.url } };
  return null;
}

/** Anthropic request -> OpenAI chat.completions body. */
export function toOpenAI(req: AnthropicRequest, upstream: Upstream, model: string, names: ToolNames): Json {
  const messages: Json[] = [];
  const system = textOf(req.system);
  if (system) messages.push({ role: "system", content: system });

  for (const m of req.messages) {
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({
        id: String(b.id), type: "function", function: { name: names.alias(String(b.name)), arguments: JSON.stringify(b.input ?? {}) },
      }));
      // Thinking blocks are Anthropic-only; they are dropped.
      if (!text && !calls.length) continue;
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // Tool results must come right after the assistant's tool calls, as role "tool" messages.
    const rest: Json[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const content = b.content as string | Block[] | undefined;
        let text = typeof content === "string" ? content : textOf(content);
        if (b.is_error) text = `Error: ${text}`;
        messages.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: text || "(no output)" });
        if (Array.isArray(content)) for (const c of content) { const img = c.type === "image" ? imagePart(c) : null; if (img) rest.push(img); }
      } else if (b.type === "text") {
        if (String(b.text ?? "").trim()) rest.push({ type: "text", text: String(b.text) });
      } else if (b.type === "image") {
        const img = imagePart(b);
        if (img) rest.push(img);
      }
    }
    if (rest.length) {
      const onlyText = rest.every((p) => p.type === "text");
      messages.push({ role: "user", content: onlyText ? rest.map((p) => p.text).join("\n") : rest });
    }
  }

  // Server-side Anthropic tools (web search, code execution, …) have no OpenAI equivalent.
  const tools = (req.tools ?? []).filter((t) => !t.type || t.type === "custom").map((t) => ({
    type: "function",
    function: {
      name: names.alias(t.name),
      description: (t.description ?? "").slice(0, 1024 * 8),
      parameters: cleanSchema(t.input_schema ?? { type: "object", properties: {} }, upstream),
    },
  }));

  const body: Json = { model, messages };
  if (tools.length) {
    body.tools = tools;
    const c = req.tool_choice;
    if (c?.type === "any") body.tool_choice = "required";
    else if (c?.type === "tool" && c.name) body.tool_choice = { type: "function", function: { name: names.alias(c.name) } };
    else if (c?.type === "none") body.tool_choice = "none";
  }
  if (req.max_tokens) body[upstream === "openai" ? "max_completion_tokens" : "max_tokens"] = req.max_tokens;
  // OpenAI's reasoning models reject a custom temperature; Gemini accepts it.
  if (upstream === "gemini" && typeof req.temperature === "number") body.temperature = req.temperature;
  if (req.stop_sequences?.length) body.stop = req.stop_sequences.slice(0, 4);
  if (req.stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  return body;
}

export function stopReason(finish: string | null | undefined, sawTool: boolean): string {
  if (sawTool || finish === "tool_calls" || finish === "function_call") return "tool_use";
  if (finish === "length") return "max_tokens";
  return "end_turn";
}

const msgId = () => `msg_${Math.random().toString(36).slice(2, 14)}`;
const toolId = () => `toolu_${Math.random().toString(36).slice(2, 14)}`;

function parseArgs(s: unknown): Json {
  if (s && typeof s === "object") return s as Json;
  try { const v = JSON.parse(String(s || "{}")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/** OpenAI chat.completion -> Anthropic message. */
export function fromOpenAI(res: Json, model: string, names: ToolNames): Json {
  const choice = ((res.choices as Json[] | undefined) ?? [])[0] ?? {};
  const msg = (choice.message as Json | undefined) ?? {};
  const content: Json[] = [];
  const text = typeof msg.content === "string" ? msg.content : "";
  if (text) content.push({ type: "text", text });
  const calls = (msg.tool_calls as Json[] | undefined) ?? [];
  for (const c of calls) {
    const fn = (c.function as Json | undefined) ?? {};
    content.push({ type: "tool_use", id: String(c.id || toolId()), name: names.original(String(fn.name)), input: parseArgs(fn.arguments) });
  }
  const usage = (res.usage as Json | undefined) ?? {};
  return {
    id: msgId(), type: "message", role: "assistant", model, content,
    stop_reason: stopReason(choice.finish_reason as string, calls.length > 0), stop_sequence: null,
    usage: { input_tokens: Number(usage.prompt_tokens ?? 0), output_tokens: Number(usage.completion_tokens ?? 0), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

const sse = (event: string, data: Json) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;

/**
 * Turns OpenAI stream chunks into Anthropic stream events. Feed each parsed `data:` JSON to push();
 * call end() once the upstream stream finishes. Both return SSE text to forward.
 */
export class StreamTranslator {
  private started = false;
  private next = 0;
  private open: { index: number; kind: "text" | "tool"; gotArgs?: boolean } | null = null;
  private tools = new Map<number, { index: number; gotArgs: boolean }>();
  private finish: string | null = null;
  private usage = { input_tokens: 0, output_tokens: 0 };
  private sawTool = false;

  constructor(private model: string, private names: ToolNames) {}

  /** Content blocks sent so far (text and tool calls). */
  get blocks(): number { return this.next; }

  private start(): string {
    if (this.started) return "";
    this.started = true;
    return sse("message_start", {
      message: { id: msgId(), type: "message", role: "assistant", model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
    });
  }

  private close(): string {
    if (!this.open) return "";
    let out = "";
    // A tool call with no streamed arguments still needs a valid JSON input.
    if (this.open.kind === "tool" && !this.open.gotArgs) out += sse("content_block_delta", { index: this.open.index, delta: { type: "input_json_delta", partial_json: "{}" } });
    out += sse("content_block_stop", { index: this.open.index });
    this.open = null;
    return out;
  }

  push(chunk: Json): string {
    let out = this.start();
    const u = chunk.usage as Json | undefined;
    if (u) this.usage = { input_tokens: Number(u.prompt_tokens ?? 0), output_tokens: Number(u.completion_tokens ?? 0) };
    for (const choice of (chunk.choices as Json[] | undefined) ?? []) {
      const delta = (choice.delta as Json | undefined) ?? {};
      if (typeof delta.content === "string" && delta.content) {
        if (this.open?.kind !== "text") {
          out += this.close();
          this.open = { index: this.next++, kind: "text" };
          out += sse("content_block_start", { index: this.open.index, content_block: { type: "text", text: "" } });
        }
        out += sse("content_block_delta", { index: this.open.index, delta: { type: "text_delta", text: delta.content } });
      }
      for (const tc of (delta.tool_calls as Json[] | undefined) ?? []) {
        const i = Number(tc.index ?? 0);
        const fn = (tc.function as Json | undefined) ?? {};
        let t = this.tools.get(i);
        if (!t) {
          out += this.close();
          t = { index: this.next++, gotArgs: false };
          this.tools.set(i, t);
          this.sawTool = true;
          this.open = { index: t.index, kind: "tool", gotArgs: false };
          out += sse("content_block_start", { index: t.index, content_block: { type: "tool_use", id: String(tc.id || toolId()), name: this.names.original(String(fn.name ?? "")), input: {} } });
        }
        const args = fn.arguments;
        if (args !== undefined && args !== null && args !== "") {
          const partial = typeof args === "string" ? args : JSON.stringify(args);
          t.gotArgs = true;
          if (this.open?.index === t.index) this.open.gotArgs = true;
          out += sse("content_block_delta", { index: t.index, delta: { type: "input_json_delta", partial_json: partial } });
        }
      }
      if (choice.finish_reason) this.finish = String(choice.finish_reason);
    }
    return out;
  }

  end(): string {
    let out = this.start();
    out += this.close();
    out += sse("message_delta", { delta: { stop_reason: stopReason(this.finish, this.sawTool), stop_sequence: null }, usage: { ...this.usage } });
    out += sse("message_stop", {});
    return out;
  }
}

/** Upstream error -> Anthropic-shaped error body. */
export function anthropicError(status: number, message: string): Json {
  const type = status === 401 || status === 403 ? "authentication_error"
    : status === 429 ? "rate_limit_error"
    : status === 404 ? "not_found_error"
    : status >= 500 ? "api_error"
    : "invalid_request_error";
  return { type: "error", error: { type, message } };
}

/** Rough token count for /v1/messages/count_tokens (about 4 characters per token). */
export function roughTokens(req: unknown): number {
  return Math.ceil(JSON.stringify(req ?? "").length / 4);
}
