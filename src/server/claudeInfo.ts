import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FAKE, getWorkspace } from "./config";

export interface ClaudeInfo {
  commands: { name: string; description: string; argumentHint: string }[];
  models: { value: string; displayName: string; description: string }[];
  mcp: { name: string; status: string; error?: string }[];
  account: { email?: string; subscriptionType?: string };
  outputStyle: string;
  /** permissions.defaultMode from ~/.claude/settings.json, so the app starts where the CLI does. */
  defaultMode: string;
}

const TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { __gaboInfo?: { at: number; info: Promise<ClaudeInfo> } };

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
};

function userDefaultMode(): string {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8"));
    return typeof settings?.permissions?.defaultMode === "string" ? settings.permissions.defaultMode : "default";
  } catch {
    return "default";
  }
}

/**
 * What the CLI knows (commands from plugins and skills, models, MCP servers, account), read from an
 * idle Claude Code process: no message is sent and nothing is saved to history. Cached for 5 minutes.
 */
async function read(): Promise<ClaudeInfo> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const abortController = new AbortController();
  async function* idle() {
    await new Promise((resolve) => abortController.signal.addEventListener("abort", resolve));
  }
  const q = query({ prompt: idle(), options: { env, cwd: getWorkspace(), persistSession: false, abortController } });
  try {
    const init = await q.initializationResult();
    const mcp = await q.mcpServerStatus();
    return {
      commands: init.commands.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
      models: init.models.map((m) => ({ value: m.value, displayName: m.displayName, description: m.description })),
      mcp: mcp.map((s) => ({ name: s.name, status: s.status, ...(s.error ? { error: s.error } : {}) })),
      account: { email: init.account?.email, subscriptionType: init.account?.subscriptionType },
      outputStyle: init.output_style,
      defaultMode: userDefaultMode(),
    };
  } finally {
    q.close();
    abortController.abort();
  }
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
