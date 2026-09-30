import { describe, expect, it } from "vitest";
import path from "node:path";
import { AI_SERVER, aiSystemNote, aiToolNames, buildAiServer, makeAskHandler } from "./aiTools";
import { PRESETS } from "./providers";
import { buildOptions } from "./runner";
import { loadSpec } from "./spec";

const chatgpt = { ...PRESETS[0], apiKey: "sk-x", enabled: true };
const hermes = { ...PRESETS[3], baseUrl: "http://127.0.0.1:11434/v1", enabled: true };

describe("AI tools for Claude", () => {
  it("names one tool per usable provider under the gabo-ai server", () => {
    expect(aiToolNames([chatgpt, hermes])).toEqual(["mcp__gabo-ai__ask_chatgpt", "mcp__gabo-ai__ask_hermes"]);
  });

  it("tells the lead which other AIs it can consult", () => {
    const note = aiSystemNote([chatgpt, hermes]);
    expect(note).toContain("mcp__gabo-ai__ask_chatgpt (ChatGPT, gpt-5-mini)");
    expect(note).toContain("mcp__gabo-ai__ask_hermes");
    expect(aiSystemNote([])).toBe("");
  });

  it("the handler returns the provider's answer, or an error Claude can read", async () => {
    const ok = makeAskHandler(chatgpt, (async () => new Response(JSON.stringify({ choices: [{ message: { content: "42" } }] }))) as typeof fetch);
    await expect(ok({ prompt: "meaning of life?" })).resolves.toEqual({ content: [{ type: "text", text: "42" }] });
    const bad = makeAskHandler(chatgpt, (async () => new Response("{}", { status: 500 })) as typeof fetch);
    const res = await bad({ prompt: "x" });
    expect(res).toMatchObject({ isError: true });
    expect(res.content[0].text).toMatch(/Couldn't get an answer from ChatGPT: ChatGPT answered 500/);
  });

  it("builds an in-process MCP server", () => {
    const server = buildAiServer([chatgpt]);
    expect(server).toMatchObject({ type: "sdk", name: AI_SERVER });
  });

  it("runs pass the server and the note through", () => {
    const opts = buildOptions({
      room: "home", workspace: path.resolve("/w"), spec: loadSpec(path.resolve(__dirname, "../..")),
      mcpServers: { [AI_SERVER]: buildAiServer([chatgpt]) }, extraWorkflow: aiSystemNote([chatgpt]),
    });
    expect(Object.keys(opts.mcpServers ?? {})).toEqual([AI_SERVER]);
    expect((opts.systemPrompt as { append: string }).append).toContain("ask_chatgpt");
  });
});
