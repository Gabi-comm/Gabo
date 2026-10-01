import { describe, expect, it } from "vitest";
import { StreamTranslator, ToolNames, anthropicError, cleanSchema, fromOpenAI, toOpenAI, type AnthropicRequest } from "./translate";
import { mapModel, PROVIDERS } from "./backend";

const parse = (sse: string) => sse.trim().split("\n\n").map((e) => JSON.parse(e.split("\n")[1].slice(6)));

describe("Anthropic → OpenAI request", () => {
  const req: AnthropicRequest = {
    model: "gpt-5-mini",
    system: [{ type: "text", text: "You are Claude Code." }],
    max_tokens: 1000,
    temperature: 0.2,
    stream: true,
    tools: [
      { name: "Read", description: "Read a file", input_schema: { $schema: "x", type: "object", properties: { file_path: { type: "string", format: "uri" } }, additionalProperties: false } },
      { name: "mcp__plugin_github_github__search_repositories_with_a_very_long_name_that_goes_past_64", input_schema: { type: "object", properties: {} } },
      { name: "web_search", type: "web_search_20250305" },
    ],
    messages: [
      { role: "user", content: "read a.ts" },
      { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Reading." }, { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "a.ts" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "export {}" }] }, { type: "text", text: "now explain" }] },
    ],
  };

  it("maps system, messages, tool calls and tool results in OpenAI order", () => {
    const body = toOpenAI(req, "openai", "gpt-5-mini", new ToolNames()) as { messages: Record<string, unknown>[] };
    expect(body.messages).toEqual([
      { role: "system", content: "You are Claude Code." },
      { role: "user", content: "read a.ts" },
      { role: "assistant", content: "Reading.", tool_calls: [{ id: "toolu_1", type: "function", function: { name: "Read", arguments: '{"file_path":"a.ts"}' } }] },
      { role: "tool", tool_call_id: "toolu_1", content: "export {}" },
      { role: "user", content: "now explain" },
    ]);
  });

  it("drops server tools, shortens long names, cleans schemas, and uses each provider's token field", () => {
    const names = new ToolNames();
    const o = toOpenAI(req, "openai", "gpt-5-mini", names) as Record<string, unknown> & { tools: { function: { name: string; parameters: Record<string, unknown> } }[] };
    expect(o.tools).toHaveLength(2);
    expect(o.tools[1].function.name.length).toBeLessThanOrEqual(64);
    expect(names.original(o.tools[1].function.name)).toBe(req.tools![1].name);
    expect(o.tools[0].function.parameters.$schema).toBeUndefined();
    expect(o.max_completion_tokens).toBe(1000);
    expect(o.temperature).toBeUndefined();
    expect(o.stream_options).toEqual({ include_usage: true });
    const g = toOpenAI(req, "gemini", "gemini-2.5-flash", new ToolNames()) as Record<string, unknown> & { tools: { function: { parameters: { properties: { file_path: Record<string, unknown> }; additionalProperties?: unknown } } }[] };
    expect(g.max_tokens).toBe(1000);
    expect(g.temperature).toBe(0.2);
    expect(g.tools[0].function.parameters.additionalProperties).toBeUndefined();
    expect(g.tools[0].function.parameters.properties.file_path.format).toBeUndefined();
  });

  it("keeps images as data URLs and marks failed tool results", () => {
    const b = toOpenAI({ model: "m", messages: [
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "what is this" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t", name: "Bash", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", is_error: true, content: "boom" }] },
    ] }, "openai", "m", new ToolNames()) as { messages: Record<string, unknown>[] };
    expect(b.messages[0]).toEqual({ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }, { type: "text", text: "what is this" }] });
    expect(b.messages[2]).toEqual({ role: "tool", tool_call_id: "t", content: "Error: boom" });
  });

  it("cleanSchema recurses into nested properties and arrays", () => {
    expect(cleanSchema({ type: "object", properties: { a: { type: "array", items: { type: "object", additionalProperties: true, properties: {} } } } }, "gemini"))
      .toEqual({ type: "object", properties: { a: { type: "array", items: { type: "object", properties: {} } } } });
  });
});

describe("OpenAI → Anthropic response", () => {
  it("non-streaming: text and tool calls, with usage and stop reason", () => {
    const names = new ToolNames();
    const short = names.alias("mcp__x__" + "y".repeat(80));
    const m = fromOpenAI({
      choices: [{ finish_reason: "tool_calls", message: { content: "Let me look.", tool_calls: [{ id: "call_1", function: { name: short, arguments: '{"q":"gabo"}' } }] } }],
      usage: { prompt_tokens: 120, completion_tokens: 9 },
    }, "gpt-5-mini", names) as { content: Record<string, unknown>[]; stop_reason: string; usage: Record<string, number> };
    expect(m.content).toEqual([{ type: "text", text: "Let me look." }, { type: "tool_use", id: "call_1", name: "mcp__x__" + "y".repeat(80), input: { q: "gabo" } }]);
    expect(m.stop_reason).toBe("tool_use");
    expect(m.usage.input_tokens).toBe(120);
  });

  it("streaming: text deltas, a tool call split over chunks, then usage and stop", () => {
    const t = new StreamTranslator("gpt-5-mini", new ToolNames());
    const out = [
      t.push({ choices: [{ delta: { content: "Hi " } }] }),
      t.push({ choices: [{ delta: { content: "there" } }] }),
      t.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "Read", arguments: '{"file' } }] } }] }),
      t.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '_path":"a"}' } }] } }] }),
      t.push({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      t.push({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 7 } }),
      t.end(),
    ].join("");
    const ev = parse(out);
    expect(ev.map((e) => e.type)).toEqual([
      "message_start", "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop",
      "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop", "message_delta", "message_stop",
    ]);
    expect(ev[5].content_block).toEqual({ type: "tool_use", id: "call_9", name: "Read", input: {} });
    expect(ev[6].delta.partial_json + ev[7].delta.partial_json).toBe('{"file_path":"a"}');
    expect(ev[9].delta.stop_reason).toBe("tool_use");
    expect(ev[9].usage).toEqual({ input_tokens: 50, output_tokens: 7 });
  });

  it("streaming: a tool call with no arguments still closes with valid JSON; Gemini's 'stop' with tools is tool_use", () => {
    const t = new StreamTranslator("g", new ToolNames());
    const ev = parse(t.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c", function: { name: "Glob" } }] }, finish_reason: "stop" }] }) + t.end());
    expect(ev.find((e) => e.type === "content_block_delta").delta).toEqual({ type: "input_json_delta", partial_json: "{}" });
    expect(ev.find((e) => e.type === "message_delta").delta.stop_reason).toBe("tool_use");
  });

  it("errors take Anthropic's shape and type", () => {
    expect(anthropicError(401, "bad key")).toEqual({ type: "error", error: { type: "authentication_error", message: "bad key" } });
    expect(anthropicError(429, "slow").error).toMatchObject({ type: "rate_limit_error" });
  });
});

describe("model mapping", () => {
  it("maps Claude aliases and full names onto the provider's three slots", () => {
    const t = PROVIDERS.openai.tiers;
    expect(mapModel("opus", t)).toBe(t.opus);
    expect(mapModel("claude-haiku-4-5-20251001", t)).toBe(t.haiku);
    expect(mapModel("sonnet", t)).toBe(t.sonnet);
    expect(mapModel("gpt-5-mini", t)).toBe("gpt-5-mini");
    expect(mapModel("o4-mini", t)).toBe("o4-mini");
  });
});
