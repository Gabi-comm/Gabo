// Plugins Gabo can connect without a claude.ai login (Local LLM page → Plugins). Pure: the server stores them.
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export interface CustomConnector {
  id: string;
  name: string;
  /** Either a command to start (stdio) … */
  command?: string;
  args?: string[];
  /** … or a URL (streamable HTTP). */
  url?: string;
  enabled: boolean;
}

export interface ConnectorsConfig {
  /** Claude Code MCP servers (from plugins and settings) allowed while the Local LLM is on. */
  plugins: Record<string, boolean>;
  notion: { enabled: boolean; token?: string };
  obsidian: { enabled: boolean; vault: string };
  custom: CustomConnector[];
  /** Skills always offered to the Local LLM, besides the ones picked for the task. */
  pinnedSkills: string[];
}

export const EMPTY_CONNECTORS: ConnectorsConfig = {
  plugins: {}, notion: { enabled: false }, obsidian: { enabled: false, vault: "" }, custom: [], pinnedSkills: [],
};

/**
 * Plugins are off for the Local LLM until ticked: each one adds its tool list to the prompt (GitHub alone is
 * about 10k tokens), which a small model reads slowly. Measured: docs/plan-local-llm-tools.md.
 */
export function pluginAllowed(cfg: ConnectorsConfig, server: string): boolean {
  return cfg.plugins[server] ?? false;
}

/** Context window a local run needs: Gabo's slim prompt is about 6k tokens, plus about 10k per plugin's tools. */
export function neededContext(pluginCount: number): number {
  return pluginCount > 0 ? 32768 : 16384;
}

/** Claude Code's tool prefix for an MCP server: mcp__<name with odd characters as _>. */
export function mcpToolPrefix(server: string): string {
  return `mcp__${server.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** disallowedTools entries that hide the servers not allowed for the Local LLM. */
export function blockedServers(cfg: ConnectorsConfig, servers: string[]): string[] {
  return servers.filter((s) => !pluginAllowed(cfg, s)).map(mcpToolPrefix);
}

const npx = (pkg: string[], platform: string): { command: string; args: string[] } =>
  platform === "win32" ? { command: "cmd", args: ["/c", "npx", "-y", ...pkg] } : { command: "npx", args: ["-y", ...pkg] };

/** The MCP servers Gabo starts itself for the connected plugins (all backends). */
export function connectorServers(cfg: ConnectorsConfig, platform = process.platform): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  if (cfg.notion.enabled && cfg.notion.token) {
    out.notion = { type: "stdio", ...npx(["@notionhq/notion-mcp-server"], platform), env: { NOTION_TOKEN: cfg.notion.token } };
  }
  for (const c of cfg.custom) {
    if (!c.enabled) continue;
    if (c.url) out[c.id] = { type: "http", url: c.url };
    else if (c.command) out[c.id] = { type: "stdio", command: c.command, args: c.args ?? [] };
  }
  return out;
}

/** Folders the agents may read and write besides the workspace. */
export function connectorRoots(cfg: ConnectorsConfig): string[] {
  return cfg.obsidian.enabled && cfg.obsidian.vault ? [cfg.obsidian.vault] : [];
}

/** One line for the lead so it knows the connected plugins exist. */
export function connectorNote(cfg: ConnectorsConfig): string | undefined {
  const parts: string[] = [];
  if (cfg.obsidian.enabled && cfg.obsidian.vault) parts.push(`Gab's Obsidian vault is at ${cfg.obsidian.vault}: read, search and write notes there with Read, Grep, Glob, Write and Edit (Markdown, [[wikilinks]]).`);
  if (cfg.notion.enabled && cfg.notion.token) parts.push("Notion is connected through the notion MCP tools (search, read and edit pages shared with the integration).");
  return parts.length ? parts.join(" ") : undefined;
}

export const CONNECTOR_ID = /^c-[a-z0-9-]{1,40}$/;
