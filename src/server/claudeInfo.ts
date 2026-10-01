import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { FAKE, getWorkspace } from "./config";

export interface ClaudeInfo {
  commands: { name: string; description: string; argumentHint: string }[];
  models: { value: string; displayName: string; description: string }[];
  mcp: { name: string; status: string; error?: string; source?: string }[];
  account: { email?: string; subscriptionType?: string };
  outputStyle: string;
  /** permissions.defaultMode from ~/.claude/settings.json, so the app starts where the CLI does. */
  defaultMode: string;
  /** Enabled Claude Code plugins from ~/.claude/settings.json (name@marketplace). */
  plugins: { id: string; name: string; marketplace: string }[];
}

const TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { __gaboInfo?: { at: number; info: Promise<ClaudeInfo> }; __gaboMcpConfigs?: Record<string, McpServerConfig> };

const FAKE_INFO: ClaudeInfo = {
  commands: [
    { name: "compact", description: "Clear history but keep a summary in context", argumentHint: "" },
    { name: "context", description: "Show current context usage", argumentHint: "" },
    { name: "superpowers:brainstorming", description: "(superpowers) Explore intent before building", argumentHint: "" },
  ],
  models: [
    { value: "default", displayName: "Default", description: "Recommended" },
    { value: "opus", displayName: "Opus", description: "Most capable" },
    { value: "haiku", displayName: "Haiku", description: "Fastest" },
  ],
  mcp: [{ name: "plugin:github:github", status: "connected" }, { name: "claude.ai Gmail", status: "needs-auth" }],
  account: { subscriptionType: "Claude Pro" },
  outputStyle: "default",
  defaultMode: "default",
  plugins: [
    { id: "superpowers@claude-plugins-official", name: "superpowers", marketplace: "claude-plugins-official" },
    { id: "github@claude-plugins-official", name: "github", marketplace: "claude-plugins-official" },
  ],
};

function userSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

function userDefaultMode(): string {
  const mode = (userSettings().permissions as { defaultMode?: unknown } | undefined)?.defaultMode;
  return typeof mode === "string" ? mode : "default";
}

function enabledPlugins(): ClaudeInfo["plugins"] {
  const map = (userSettings().enabledPlugins ?? {}) as Record<string, unknown>;
  return Object.entries(map)
    .filter(([, on]) => on === true)
    .map(([id]) => ({ id, name: id.split("@")[0], marketplace: id.split("@")[1] ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What the CLI knows (commands from plugins and skills, models, MCP servers, account), read from an
 * idle Claude Code process: no message is sent and nothing is saved to history. Cached for 5 minutes.
 */
async function read(): Promise<ClaudeInfo> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { activeBackend } = await import("./backend");
  const env = activeBackend().env;
  const abortController = new AbortController();
  async function* idle() {
    await new Promise((resolve) => abortController.signal.addEventListener("abort", resolve));
  }
  const q = query({ prompt: idle(), options: { env, cwd: getWorkspace(), persistSession: false, abortController } });
  try {
    const init = await q.initializationResult();
    const mcp = await q.mcpServerStatus();
    // Configs can hold tokens (headers, env): kept on the server, never in ClaudeInfo (which the browser gets).
    const configs: Record<string, McpServerConfig> = {};
    for (const s of mcp) {
      const c = s.config as { type?: string; url?: string } | undefined;
      if (c && c.type !== "claudeai-proxy" && (c.type !== "http" || c.url)) configs[s.name] = c as McpServerConfig;
    }
    g.__gaboMcpConfigs = configs;
    return {
      commands: init.commands.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
      models: init.models.map((m) => ({ value: m.value, displayName: m.displayName, description: m.description })),
      mcp: mcp.map((s) => ({ name: s.name, status: s.status, ...(s.error ? { error: s.error } : {}), ...(s.source ? { source: s.source } : {}) })),
      account: { email: init.account?.email, subscriptionType: init.account?.subscriptionType },
      outputStyle: init.output_style,
      defaultMode: userDefaultMode(),
      plugins: enabledPlugins(),
    };
  } finally {
    q.close();
    abortController.abort();
  }
}

/** The configs of Claude Code's own MCP servers (plugins, settings), by name. claude.ai connectors excluded. */
export async function mcpConfigs(): Promise<Record<string, McpServerConfig>> {
  if (FAKE) return { "plugin:github:github": { type: "http", url: "https://api.githubcopilot.com/mcp/" } };
  await getClaudeInfo().catch(() => null);
  return g.__gaboMcpConfigs ?? {};
}

export function getClaudeInfo(refresh = false): Promise<ClaudeInfo> {
  if (FAKE) return Promise.resolve(FAKE_INFO);
  const cached = g.__gaboInfo;
  if (!refresh && cached && Date.now() - cached.at < TTL_MS) return cached.info;
  const info = read();
  g.__gaboInfo = { at: Date.now(), info };
  info.catch(() => { if (g.__gaboInfo?.info === info) g.__gaboInfo = undefined; });
  return info;
}
