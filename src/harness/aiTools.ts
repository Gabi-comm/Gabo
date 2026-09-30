import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { askProvider, type AskInput, type ProviderConfig } from "./providers";

/** In-process MCP server that lets Claude consult the AIs configured on the Plugins page. */
export const AI_SERVER = "gabo-ai";

export function aiToolNames(providers: ProviderConfig[]): string[] {
  return providers.map((p) => `mcp__${AI_SERVER}__ask_${p.id}`);
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function makeAskHandler(p: ProviderConfig, fetchImpl: typeof fetch = fetch) {
  return async (args: AskInput): Promise<ToolResult> => {
    try {
      return { content: [{ type: "text", text: await askProvider(p, args, fetchImpl) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Couldn't get an answer from ${p.label}: ${message}` }], isError: true };
    }
  };
}

export function buildAiServer(providers: ProviderConfig[]): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: AI_SERVER,
    version: "1.0.0",
    tools: providers.map((p) =>
      tool(
        `ask_${p.id}`,
        `Ask ${p.label} (${p.model}) and get its answer as text. Use it when Gab asks to consult ${p.label}, for a second opinion, or to compare answers. It has no access to this conversation or the workspace: put everything it needs in the prompt.`,
        {
          prompt: z.string().min(1).max(100_000).describe("The full question, with any context it needs."),
          system: z.string().max(20_000).optional().describe("Optional system instructions for the other model."),
        },
        makeAskHandler(p),
      ),
    ),
  });
}

/** One line for the lead's system prompt, so Claude knows which other AIs it can reach. */
export function aiSystemNote(providers: ProviderConfig[]): string {
  if (!providers.length) return "";
  const list = providers.map((p) => `mcp__${AI_SERVER}__ask_${p.id} (${p.label}, ${p.model})`).join(", ");
  return `Other AIs Gab connected on the Plugins page, callable as tools: ${list}. Each call costs Gab money on that provider and needs his approval; say what you will ask and why.`;
}
